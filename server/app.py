"""
FastAPI Documentation Manager with Git Integration
A comprehensive documentation management system with version control
"""
import os
import re
import shutil
from typing import Optional, List, Dict, Any
from pathlib import Path

from fastapi import FastAPI, File, Form, UploadFile, Request, Query
from fastapi.exceptions import HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from git import Repo, GitCommandError


# ==================== CONFIGURATION ====================

class Config:
    """Application configuration"""
    DOCS_DIR = "docs"
    BASE_DIR = Path("../../" + DOCS_DIR).resolve()
    STATIC_FOLDER = Path("../dist")
    REPO_DIR = Path("../../")
    ALLOWED_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".svg"}
    MARKDOWN_EXT = ".md"


config = Config()


# ==================== PYDANTIC MODELS ====================

class PathModel(BaseModel):
    """Model for file/folder path operations"""
    path: str
    type: Optional[str] = Field(None, pattern="^(file|folder)$")


class RenameModel(BaseModel):
    """Model for rename operations with collision handling"""
    oldPath: str
    newPath: str
    action: str = Field("check", pattern="^(check|overwrite|increment)$")


class FileRequest(BaseModel):
    """Model for git file operations"""
    filename: str


class DiffRequest(BaseModel):
    """Model for git diff comparison"""
    filename: str
    branch_left: str
    commit_left: str
    branch_right: str
    commit_right: str


class GitCommitRequest(BaseModel):
    """Model for git commit operation"""
    message: str = Field(default="(no message)")
    files: List[str] = Field(default_factory=list)


# ==================== PATH UTILITIES ====================

class PathUtils:
    """Utilities for safe path handling"""
    
    @staticmethod
    def normalize_relative_path(path: str) -> str:
        """
        Normalize and sanitize a relative path to prevent directory traversal
        
        Args:
            path: Input path string
            
        Returns:
            Normalized path
            
        Raises:
            ValueError: If path contains directory traversal attempts
        """
        path = path.replace("\\", "/").strip()
        
        # Remove leading path components
        while path.startswith(("../", "./", "/")):
            path = path.lstrip("./").lstrip("/")
        
        # Normalize and check for traversal
        path = os.path.normpath(path).replace("\\", "/")
        
        if ".." in path.split("/"):
            raise ValueError("Invalid path: directory traversal detected")
        
        return path
    
    @staticmethod
    def safe_join(base: Path, *paths: str) -> Path:
        """
        Safely join paths ensuring result stays within base directory
        
        Args:
            base: Base directory path
            paths: Path components to join
            
        Returns:
            Safe absolute path
            
        Raises:
            ValueError: If resulting path is outside base directory
        """
        normalized = [PathUtils.normalize_relative_path(p) for p in paths]
        final_path = Path(base).joinpath(*normalized).resolve()
        
        if not str(final_path).startswith(str(base)):
            raise ValueError("Unsafe path: outside base directory")
        
        return final_path


# ==================== FILE UTILITIES ====================

class FileUtils:
    """Utilities for file operations"""
    
    @staticmethod
    def sanitize_filename(filename: str) -> str:
        """Replace unsafe characters in filename with underscores"""
        name, ext = os.path.splitext(filename)
        name = re.sub(r"[^a-zA-Z0-9_\-]", "_", name)
        return f"{name}{ext}"
    
    @staticmethod
    def increment_filename(directory: Path, filename: str) -> str:
        """
        Generate unique filename by incrementing numeric suffix
        
        Args:
            directory: Directory to check for existing files
            filename: Original filename
            
        Returns:
            Unique filename
        """
        name, ext = os.path.splitext(filename)
        match = re.search(r"(.*?)(\d+)$", name)
        
        if match:
            prefix, number = match.groups()
            counter = int(number) + 1
            width = len(number)
        else:
            prefix, counter, width = f"{name}_", 1, 4
        
        while True:
            new_name = f"{prefix}{counter:0{width}d}{ext}"
            if not (directory / new_name).exists():
                return new_name
            counter += 1
    
    @staticmethod
    def scan_directory(path: Path, base: Path, ext_filter: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """
        Recursively scan directory and return tree structure
        
        Args:
            path: Directory to scan
            base: Base directory for relative paths
            ext_filter: Optional list of file extensions to include
            
        Returns:
            List of file/folder entries with metadata
        """
        entries = []
        
        try:
            for entry in sorted(path.iterdir()):
                rel_path = entry.relative_to(base).as_posix()
                
                if entry.is_dir():
                    entries.append({
                        "type": "folder",
                        "name": entry.name,
                        "path": rel_path,
                        "children": FileUtils.scan_directory(entry, base, ext_filter)
                    })
                elif not ext_filter or entry.suffix.lower() in ext_filter:
                    entries.append({
                        "type": "file",
                        "name": entry.name,
                        "path": rel_path
                    })
        except PermissionError:
            pass
        
        return entries


# ==================== GIT UTILITIES ====================

class GitUtils:
    """Utilities for git operations"""
    
    def __init__(self, repo: Repo):
        self.repo = repo
        self.docs_dir = config.DOCS_DIR
    
    def get_file_content(self, commit_hash: str, filepath: str) -> str:
        """
        Read file content from specific commit
        
        Args:
            commit_hash: Git commit hash
            filepath: Relative path to file
            
        Returns:
            File content or error message
        """
        target_file = f"{self.docs_dir}/{filepath.replace('\\', '/')}"
        
        try:
            blob = self.repo.commit(commit_hash).tree / target_file
            return blob.data_stream.read().decode("utf-8").replace("\r", "")
        except KeyError:
            return f"// File not found in commit {commit_hash}"
        except Exception as e:
            return f"// Error reading file: {e}"
    
    def get_md_files_from_commit(self, commit_obj) -> set:
        """Get all .md files from a commit"""
        files = set()
        
        try:
            docs_tree = commit_obj.tree / self.docs_dir
            for item in docs_tree.traverse():
                if item.type == 'blob' and item.path.endswith('.md'):
                    rel_path = os.path.relpath(item.path, self.docs_dir).replace("\\", "/")
                    files.add(rel_path)
        except KeyError:
            pass
        
        return files
    
    def check_head_status(self) -> tuple[bool, Optional[str]]:
        """
        Check if HEAD is detached and get active branch
        
        Returns:
            Tuple of (is_detached, active_branch_name)
        """
        try:
            is_detached = self.repo.head.is_detached
            active_branch = None if is_detached else self.repo.active_branch.name
            return is_detached, active_branch
        except Exception:
            return True, None
    
    def check_remote_status(self, branch_name: str) -> Dict[str, Any]:
        """
        Check relationship between local and remote branch
        
        Returns:
            Dictionary with status information
        """
        remote_ref = f"origin/{branch_name}"
        
        if remote_ref not in self.repo.refs:
            return {"status": "no_remote"}
        
        local_commit = self.repo.commit(branch_name)
        remote_commit = self.repo.commit(remote_ref)
        
        is_local_behind = self.repo.is_ancestor(local_commit, remote_commit)
        is_remote_behind = self.repo.is_ancestor(remote_commit, local_commit)
        
        if is_local_behind and not is_remote_behind:
            return {"status": "behind", "detail": f"Branch '{branch_name}' is behind remote"}
        
        if not is_local_behind and not is_remote_behind:
            return {"status": "diverged", "detail": f"Branch '{branch_name}' has diverged from remote"}
        
        return {"status": "ok"}


# ==================== FASTAPI APPLICATION ====================

app = FastAPI(
    title="Documentation Manager API",
    description="API for managing documentation with git integration",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Git repository
if not (config.REPO_DIR / ".git").exists():
    raise FileNotFoundError(f"Git repository not found in {config.REPO_DIR}")

repo = Repo(config.REPO_DIR)
git_utils = GitUtils(repo)


# ==================== FILE MANAGEMENT ROUTES ====================

@app.get("/api/tree")
async def get_file_tree():
    """Get recursive tree of all markdown files"""
    return FileUtils.scan_directory(config.BASE_DIR, config.BASE_DIR, [config.MARKDOWN_EXT])


@app.get("/api/file")
async def get_file(path: str):
    """Get file content and metadata"""
    try:
        full_path = PathUtils.safe_join(config.BASE_DIR, path)
        
        if not full_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        with open(full_path, "r", encoding="utf-8") as f:
            content = f.read()
        
        mtime = full_path.stat().st_mtime
        
        return {
            "content": content,
            "last_modified": int(mtime * 1000)
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/file/meta")
async def get_file_meta(path: str):
    """Get file modification timestamp"""
    try:
        full_path = PathUtils.safe_join(config.BASE_DIR, path)
        
        if not full_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        mtime = full_path.stat().st_mtime
        return {"last_modified": int(mtime * 1000)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/file")
async def save_file(path: str, request: Request):
    """Save content to file"""
    try:
        full_path = PathUtils.safe_join(config.BASE_DIR, path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    data = await request.json()
    content = data.get("content", "")
    
    full_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)
    
    mtime = full_path.stat().st_mtime
    
    return {
        "status": "saved",
        "last_modified": int(mtime * 1000)
    }


@app.post("/api/create")
async def create_file_or_folder(data: PathModel):
    """Create new file or folder"""
    try:
        full_path = PathUtils.safe_join(config.BASE_DIR, data.path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    if data.type == "folder":
        full_path.mkdir(parents=True, exist_ok=True)
    elif data.type == "file":
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.touch()
    
    return {"status": "created", "path": data.path}


@app.post("/api/delete")
async def delete_path(data: PathModel):
    """Delete file or folder"""
    try:
        full_path = PathUtils.safe_join(config.BASE_DIR, data.path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Path does not exist")
    
    if full_path.is_file():
        full_path.unlink()
    else:
        shutil.rmtree(full_path)
    
    return {"status": "deleted", "path": data.path}


@app.post("/api/rename")
async def rename_path(data: RenameModel):
    """Rename file or folder with collision handling"""
    try:
        old_path = PathUtils.safe_join(config.BASE_DIR, data.oldPath.lstrip("/"))
        new_path = PathUtils.safe_join(config.BASE_DIR, data.newPath.lstrip("/"))
        
        if data.action == "check":
            if new_path.exists():
                return JSONResponse({"collision": True}, status_code=409)
        
        elif data.action == "overwrite":
            if old_path.resolve() == new_path.resolve():
                return {"status": "no_change", "newPath": data.newPath}
            
            if new_path.exists():
                new_path.unlink()
        
        elif data.action == "increment":
            new_name = FileUtils.increment_filename(new_path.parent, new_path.name)
            new_path = new_path.parent / new_name
        
        new_path.parent.mkdir(parents=True, exist_ok=True)
        old_path.rename(new_path)
        
        rel_path = new_path.relative_to(config.BASE_DIR).as_posix()
        return {"status": "saved", "newPath": rel_path}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== IMAGE MANAGEMENT ROUTES ====================

@app.get("/api/images_in_folder")
async def images_in_folder(folder: str = ""):
    """List images in specific folder"""
    try:
        folder = PathUtils.normalize_relative_path(folder)
    except ValueError:
        return []
    
    static_dir = config.BASE_DIR / "_static"
    folder_path = static_dir / folder
    
    if not folder_path.is_dir():
        return []
    
    return FileUtils.scan_directory(folder_path, static_dir, list(config.ALLOWED_IMAGE_EXTS))


@app.get("/api/image_tree")
async def get_image_tree():
    """Get tree of all images in _static folder"""
    static_root = config.BASE_DIR / "_static"
    return FileUtils.scan_directory(static_root, static_root)


@app.post("/api/upload_image")
async def upload_image(
    file: UploadFile = File(...),
    path: str = Form(...),
    action: str = Form("check")
):
    """Upload image with collision handling"""
    filename = FileUtils.sanitize_filename(file.filename)
    
    try:
        normalized_path = PathUtils.normalize_relative_path(path)
        if not normalized_path.startswith("_static/"):
            normalized_path = f"_static/{normalized_path}"
        
        full_path = PathUtils.safe_join(config.BASE_DIR, normalized_path, filename)
        
        if action == "check" and full_path.exists():
            return JSONResponse({"collision": True}, status_code=409)
        
        if action == "increment":
            filename = FileUtils.increment_filename(full_path.parent, filename)
            full_path = full_path.parent / filename
        
        full_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(full_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
        
        rel_path = full_path.relative_to(config.BASE_DIR).as_posix()
        return {"status": "saved", "newPath": rel_path}
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==================== GIT OPERATION ROUTES ====================

@app.post("/search-file")
async def search_file(req: FileRequest):
    """Get git history for file"""
    target_file = f"{config.DOCS_DIR}/{req.filename.replace('\\', '/')}" if req.filename else None
    
    try:
        if not repo.branches:
            return {
                "branches": [],
                "commits": {},
                "active_branch": None,
                "head_commit": None,
            }
        
        branches = []
        commits = {}
        
        for branch in repo.branches:
            branch_name = branch.name
            try:
                branches.append(branch_name)
                commits[branch_name] = []
                
                branch_commits = list(repo.iter_commits(branch_name))
                
                for idx, commit in enumerate(branch_commits):
                    file_exists = True
                    
                    if target_file:
                        try:
                            _ = commit.tree / target_file
                        except (KeyError, Exception):
                            file_exists = False
                    
                    commits[branch_name].append({
                        "hash": commit.hexsha,
                        "summary": commit.summary,
                        "message": commit.message,
                        "index": idx + 1,
                        "file_exists": file_exists
                    })
            except Exception as e:
                print(f"Error processing branch {branch_name}: {e}")
                continue
        
        is_detached, active_branch = git_utils.check_head_status()
        head_commit = repo.head.commit.hexsha if repo.head.commit else None
        
        return {
            "branches": sorted(set(branches)),
            "commits": commits,
            "active_branch": active_branch,
            "head_commit": head_commit,
        }
    except Exception as e:
        print(f"Error in search_file: {e}")
        return {
            "branches": [],
            "commits": {},
            "active_branch": None,
            "head_commit": None,
        }


@app.post("/get-file-from-git")
async def get_file_from_git(req: DiffRequest):
    """Get file content from two commits for diff"""
    left_content = git_utils.get_file_content(req.commit_left, req.filename)
    right_content = git_utils.get_file_content(req.commit_right, req.filename)
    
    return {
        "left_content": left_content,
        "right_content": right_content,
    }


@app.get("/api/git-diff-tree")
async def git_diff_tree(
    commit_left: str = Query(...),
    commit_right: str = Query(...)
):
    """Get diff between two commits"""
    commit_left_obj = repo.commit(commit_left)
    commit_right_obj = repo.commit(commit_right)
    
    diffs = commit_right_obj.diff(commit_left_obj, paths=config.DOCS_DIR)
    
    result = []
    for d in diffs:
        status = "M"
        if d.new_file:
            status = "A"
        elif d.deleted_file:
            status = "D"
        elif d.renamed:
            status = "R"
        
        result.append({
            "old_path": d.rename_from if d.renamed else d.a_path,
            "new_path": d.rename_to if d.renamed else d.b_path,
            "status": status,
        })
    
    return result


@app.get("/api/git-head")
async def git_head():
    """Get current HEAD commit and active branch"""
    try:
        is_detached, active_branch = git_utils.check_head_status()
        
        return {
            "head": repo.head.commit.hexsha,
            "active_branch": active_branch
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/git-diff-working-tree")
async def git_diff_working_tree(commit: str = Query(...)):
    """Compare working tree against commit"""
    try:
        result = []
        
        # Get tracked changes
        diff_output = repo.git.diff("--name-status", commit, config.DOCS_DIR)
        
        for line in diff_output.splitlines():
            parts = line.split("\t")
            if not parts:
                continue
            
            status = parts[0]
            
            if status.startswith("R"):
                _, old, new = parts
                result.append({
                    "old_path": old,
                    "new_path": new,
                    "status": "R"
                })
            else:
                path = parts[1]
                result.append({
                    "old_path": path if status != "A" else None,
                    "new_path": path if status != "D" else None,
                    "status": status
                })
        
        # Get untracked .md files
        untracked = repo.git.ls_files("--others", "--exclude-standard", config.DOCS_DIR).splitlines()
        
        for file_path in untracked:
            if file_path.endswith('.md'):
                result.append({
                    "old_path": None,
                    "new_path": file_path,
                    "status": "A"
                })
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/tree-union")
async def get_tree_union(
    commit_left: str = Query(...),
    commit_right: str = Query(...)
):
    """Get union of files from two commits"""
    try:
        left_files = git_utils.get_md_files_from_commit(repo.commit(commit_left))
        right_files = git_utils.get_md_files_from_commit(repo.commit(commit_right))
        
        md_union = left_files | right_files
        local_tree = FileUtils.scan_directory(config.BASE_DIR, config.BASE_DIR, [config.MARKDOWN_EXT])
        
        def filter_tree(nodes):
            result = []
            for node in nodes:
                if node['type'] == 'file':
                    if node['path'] in md_union:
                        result.append(node)
                elif node['type'] == 'folder':
                    filtered_children = filter_tree(node.get('children', []))
                    if filtered_children:
                        node['children'] = filtered_children
                        result.append(node)
            return result
        
        return filter_tree(local_tree)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/tree-local-diff")
async def get_tree_local_diff():
    """Get local changes compared to HEAD"""
    try:
        result = []
        changed_files = set()
        
        try:
            head_commit = repo.head.commit.hexsha
        except Exception:
            head_commit = None
        
        if head_commit:
            diff_output = repo.git.diff("--name-status", head_commit, config.DOCS_DIR)
            
            for line in diff_output.splitlines():
                parts = line.split("\t")
                if not parts or len(parts) < 2:
                    continue
                
                status = parts[0]
                
                if status.startswith("R") or status not in ("M", "A", "D"):
                    continue
                
                path = parts[1]
                
                if not path.endswith(".md") or status not in ("M", "A"):
                    continue
                
                old_path = path if status != "A" else None
                new_path = path if status != "D" else None
                
                result.append({"old_path": old_path, "new_path": new_path, "status": status})
                
                p = (new_path or old_path).replace("\\", "/")
                prefix = f"{config.DOCS_DIR.rstrip('/')}/"
                
                if p.startswith(prefix):
                    p = p[len(prefix):]
                
                changed_files.add(p)
        
        # Add untracked files
        try:
            untracked = repo.git.ls_files("--others", "--exclude-standard", config.DOCS_DIR).splitlines()
            
            for file_path in untracked:
                if not file_path.endswith(".md"):
                    continue
                
                result.append({"old_path": None, "new_path": file_path, "status": "A"})
                
                p = file_path.replace("\\", "/")
                prefix = f"{config.DOCS_DIR.rstrip('/')}/"
                
                if p.startswith(prefix):
                    p = p[len(prefix):]
                
                changed_files.add(p)
        except Exception:
            pass
        
        local_tree = FileUtils.scan_directory(config.BASE_DIR, config.BASE_DIR, [config.MARKDOWN_EXT])
        
        def filter_tree(nodes):
            filtered = []
            for node in nodes:
                if node["type"] == "file":
                    if node["path"] in changed_files:
                        filtered.append({
                            "type": node["type"],
                            "name": node["name"],
                            "path": node["path"]
                        })
                elif node["type"] == "folder":
                    children = filter_tree(node.get("children", []))
                    if children:
                        filtered.append({
                            "type": "folder",
                            "name": node["name"],
                            "path": node["path"],
                            "children": children
                        })
            return filtered
        
        return {"tree": filter_tree(local_tree), "diffs": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/git-commit-all")
async def git_commit_all(payload: GitCommitRequest):
    """Commit changes to git"""
    try:
        is_detached, active_branch = git_utils.check_head_status()
        
        if is_detached:
            raise HTTPException(
                status_code=400,
                detail="Repository is in detached HEAD state. Check out a branch first."
            )
        
        remote_status = git_utils.check_remote_status(active_branch)
        
        if remote_status["status"] == "behind":
            raise HTTPException(status_code=409, detail=remote_status["detail"])
        
        if remote_status["status"] == "diverged":
            raise HTTPException(status_code=409, detail=remote_status["detail"])
        
        # Stage files
        if payload.files:
            for f in payload.files:
                repo.git.add(os.path.join(config.DOCS_DIR, f))
        else:
            repo.git.add(all=True)
        
        # Commit
        new_commit = repo.index.commit(payload.message)
        
        return {
            "status": "success",
            "commit": new_commit.hexsha,
            "summary": new_commit.summary,
            "active_branch": active_branch,
        }
    except GitCommandError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/git-push")
async def git_push():
    """Push to remote repository"""
    try:
        is_detached, active_branch = git_utils.check_head_status()
        
        if is_detached:
            raise HTTPException(status_code=400, detail="HEAD is detached")
        
        origin = repo.remotes.origin
        refspec = f"refs/heads/{active_branch}:refs/heads/{active_branch}"
        push_info_list = origin.push(refspec)
        
        push_summary = []
        for info in push_info_list:
            push_summary.append(str(info.summary))
            
            if info.flags & info.ERROR or info.flags & info.REJECTED:
                raise HTTPException(
                    status_code=409,
                    detail=f"Push rejected: {info.summary}"
                )
        
        return {
            "status": "success",
            "push_result": push_summary,
            "commit": repo.head.commit.hexsha,
            "active_branch": active_branch
        }
    except GitCommandError as e:
        error_msg = "Non-fast-forward" if "non-fast-forward" in str(e) else str(e)
        raise HTTPException(status_code=409, detail=error_msg)


@app.post("/api/git-pull")
async def git_pull():
    """Pull from remote with rebase"""
    try:
        is_detached, active_branch = git_utils.check_head_status()
        
        if is_detached:
            raise HTTPException(
                status_code=400,
                detail="Repository is in detached HEAD state. Check out a branch first."
            )
        
        try:
            repo.git.pull("--rebase", "origin", active_branch)
        except GitCommandError as e:
            if "CONFLICT" in str(e) or "rebase" in str(e):
                # Abort rebase if in progress
                rebase_dirs = ["rebase-apply", "rebase-merge"]
                git_dir = Path(repo.git_dir)
                
                if any((git_dir / d).exists() for d in rebase_dirs):
                    try:
                        repo.git.rebase("--abort")
                    except Exception:
                        pass
                
                raise HTTPException(status_code=409, detail="Rebase conflict occurred")
            raise
        
        return {
            "status": "success",
            "commit": repo.head.commit.hexsha,
            "active_branch": active_branch,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== STATIC FILE ROUTES ====================

@app.get("/_static/{subpath:path}")
async def serve_static_files(subpath: str):
    """Serve static files from _static directory"""
    try:
        full_path = PathUtils.safe_join(config.BASE_DIR / "_static", subpath)
        
        if not full_path.is_file():
            raise HTTPException(status_code=404, detail="File not found")
        
        headers = {"Cache-Control": "no-cache, no-store, must-revalidate"}
        return FileResponse(full_path, headers=headers)
    except ValueError:
        raise HTTPException(status_code=403, detail="Forbidden")


@app.get("/dictionaries/{path:path}")
async def send_dictionaries(path: str):
    """Serve dictionary files from frontend build"""
    return FileResponse(config.STATIC_FOLDER / "dictionaries" / path)


@app.get("/templates/{path:path}")
async def get_templates(path: str):
    """Serve template files from frontend build"""
    return FileResponse(config.STATIC_FOLDER / "templates" / path)


@app.get("/linkedtemplatelist.json")
async def serve_linked_template_list():
    """Serve linked template list JSON"""
    return FileResponse(config.STATIC_FOLDER / "linkedtemplatelist.json")


@app.post("/save")
async def save_uploaded_file(file: UploadFile = File(...), filename: str = ""):
    """Save uploaded file to disk"""
    if not filename:
        raise HTTPException(status_code=400, detail="Missing filename")
    
    try:
        save_path = PathUtils.safe_join(config.BASE_DIR, filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    save_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(save_path, "wb") as f:
        f.write(await file.read())
    
    return {"success": True, "path": str(save_path)}


# Mount frontend static files
app.mount("/", StaticFiles(directory=str(config.STATIC_FOLDER), html=True), name="frontend")


# ==================== APPLICATION ENTRY POINT ====================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=5000, reload=True)