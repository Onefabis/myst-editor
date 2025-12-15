"""
Starlette Documentation Manager with Git Integration
A comprehensive documentation management system with version control
"""
import os
import re
import tempfile
import shutil
import json
from typing import Optional, List, Dict, Any
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

from starlette.applications import Starlette
from starlette.routing import Route, Mount
from starlette.requests import Request
from starlette.responses import JSONResponse, FileResponse, Response
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles
from starlette.exceptions import HTTPException
from starlette.datastructures import UploadFile
from git import Repo, GitCommandError


# ==================== CONFIGURATION START ==================== #

class Config:
    """Application configuration"""
    DOCS_DIR = "docs"
    BASE_DIR = Path("../../" + DOCS_DIR).resolve()
    STATIC_FOLDER = Path("../dist")
    REPO_DIR = Path("../../")
    ALLOWED_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".svg"}
    MARKDOWN_EXT = ".md"


config = Config()

# ==================== CONFIGURATION END ==================== #


# ==================== RENAME IMAGE CONFIGS START =============== #

MD_EXT = ".md"
MAX_WORKERS = 12

# --- Regex patterns ---
RE_MD = re.compile(r'(!?\[[^\]]*\]\()\s*([^\)\s]+)\s*(\))')
RE_REF = re.compile(r'^(\s*\[[^\]]+\]:\s*)(\S+)\s*$', re.MULTILINE)
RE_IMG = re.compile(r'(<img[^>]*?\bsrc=["\'])([^"\']+)(["\'])', re.IGNORECASE)

# ==================== RENAME IMAGE CONFIGS END =============== #


# ==================== PATH UTILITIES START ==================== #

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

# ==================== PATH UTILITIES END ==================== #


# ==================== FILE UTILITIES START ==================== #

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

# ==================== FILE UTILITIES END ==================== #


# ==================== GIT UTILITIES START ==================== #

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


# Initialize Git repository
if not (config.REPO_DIR / ".git").exists():
    raise FileNotFoundError(f"Git repository not found in {config.REPO_DIR}")

# Always resolve as absolute path to .git directory
git_root = Path(config.REPO_DIR).resolve()

# This ensures repo is ALWAYS the project/.git dir
repo = Repo(git_root)

git_utils = GitUtils(repo)

# ==================== GIT UTILITIES END ==================== #


# ==================== MARKDOWN REFERENCE UPDATER START ==================== #

def update_md_refs(repo_root: Path, old_rel: str, new_rel: str) -> dict:
    """Scan repo_root and replace old_rel → new_rel in all .md files."""
    old_rel = old_rel.lstrip("/")
    new_rel = new_rel.lstrip("/")
    old_base = os.path.basename(old_rel)
    new_base = os.path.basename(new_rel)

    # --- 1) Collect all markdown files fast ---
    md_files = []
    for dp, _, files in os.walk(repo_root):
        md_files += [Path(dp) / f for f in files if f.lower().endswith(MD_EXT)]

    def fix_path(path: str) -> str:
        path = path.strip().strip('"').strip("'").replace("\\", "/")
        if path == old_rel:
            return new_rel
        if path.endswith("/" + old_base) or path == old_base:
            return path[: len(path) - len(old_base)] + new_base
        return path

    def replace_in_text(txt: str):
        count = 0

        def md_cb(m):
            nonlocal count
            np = fix_path(m.group(2))
            if np != m.group(2): count += 1
            return f"{m.group(1)}{np}{m.group(3)}"

        def ref_cb(m):
            nonlocal count
            np = fix_path(m.group(2))
            if np != m.group(2): count += 1
            return f"{m.group(1)}{np}"

        def img_cb(m):
            nonlocal count
            np = fix_path(m.group(2))
            if np != m.group(2): count += 1
            return f"{m.group(1)}{np}{m.group(3)}"

        txt = RE_MD.sub(md_cb, txt)
        txt = RE_REF.sub(ref_cb, txt)
        txt = RE_IMG.sub(img_cb, txt)
        return txt, count

    def process_file(path: Path):
        try:
            text = path.read_text(encoding="utf-8")
        except Exception:
            try: text = path.read_text(encoding="latin-1")
            except: return 0

        new_text, cnt = replace_in_text(text)
        if cnt == 0 or new_text == text:
            return 0

        fd, tmp = tempfile.mkstemp(dir=path.parent)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(new_text)
        os.replace(tmp, path)
        return cnt

    # --- 2) Parallel processing ---
    changed = 0
    with ThreadPoolExecutor(MAX_WORKERS) as ex:
        futs = [ex.submit(process_file, p) for p in md_files]
        for f in as_completed(futs):
            changed += f.result()

    return {
        "scanned": len(md_files),
        "updated_references": changed,
    }

# ==================== MARKDOWN REFERENCE UPDATER END ==================== #


# ==================== ROUTE HANDLERS START ==================== #

async def get_file_tree(request: Request):
    """Get recursive tree of all markdown files"""
    return JSONResponse(
        FileUtils.scan_directory(config.BASE_DIR, config.BASE_DIR, [config.MARKDOWN_EXT])
    )


async def get_file(request: Request):
    """Get file content and metadata"""
    path = request.query_params.get("path")
    if not path:
        raise HTTPException(status_code=400, detail="Missing path parameter")
    
    try:
        full_path = PathUtils.safe_join(config.BASE_DIR, path)
        
        if not full_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        with open(full_path, "r", encoding="utf-8") as f:
            content = f.read()
        
        mtime = full_path.stat().st_mtime
        
        return JSONResponse({
            "content": content,
            "last_modified": int(mtime * 1000)
        })
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


async def get_file_meta(request: Request):
    """Get file modification timestamp"""
    path = request.query_params.get("path")
    if not path:
        raise HTTPException(status_code=400, detail="Missing path parameter")
    
    try:
        full_path = PathUtils.safe_join(config.BASE_DIR, path)
        
        if not full_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        mtime = full_path.stat().st_mtime
        return JSONResponse({"last_modified": int(mtime * 1000)})
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


async def save_file(request: Request):
    """Save content to file"""
    path = request.query_params.get("path")
    if not path:
        raise HTTPException(status_code=400, detail="Missing path parameter")
    
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
    
    return JSONResponse({
        "status": "saved",
        "last_modified": int(mtime * 1000)
    })


async def create_file_or_folder(request: Request):
    """Create new file or folder"""
    data = await request.json()
    path = data.get("path")
    type_ = data.get("type")
    
    if not path:
        raise HTTPException(status_code=400, detail="Missing path")
    
    try:
        full_path = PathUtils.safe_join(config.BASE_DIR, path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    if type_ == "folder":
        full_path.mkdir(parents=True, exist_ok=True)
    elif type_ == "file":
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.touch()
    
    return JSONResponse({"status": "created", "path": path})


async def delete_path(request: Request):
    """Delete file or folder"""
    data = await request.json()
    path = data.get("path")
    
    if not path:
        raise HTTPException(status_code=400, detail="Missing path")
    
    try:
        full_path = PathUtils.safe_join(config.BASE_DIR, path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Path does not exist")
    
    if full_path.is_file():
        full_path.unlink()
    else:
        shutil.rmtree(full_path)
    
    return JSONResponse({"status": "deleted", "path": path})


async def rename_path(request: Request):
    """Rename file or folder with collision handling"""
    data = await request.json()
    old_path = data.get("oldPath")
    new_path = data.get("newPath")
    action = data.get("action", "check")
    
    if not old_path or not new_path:
        raise HTTPException(status_code=400, detail="Missing oldPath or newPath")
    
    try:
        old_full = PathUtils.safe_join(config.BASE_DIR, old_path.lstrip("/"))
        new_full = PathUtils.safe_join(config.BASE_DIR, new_path.lstrip("/"))
        
        if action == "check":
            if new_full.exists():
                return JSONResponse({"collision": True}, status_code=409)
        
        elif action == "overwrite":
            if old_full.resolve() == new_full.resolve():
                return JSONResponse({"status": "no_change", "newPath": new_path})
            
            if new_full.exists():
                new_full.unlink()
        
        elif action == "increment":
            new_name = FileUtils.increment_filename(new_full.parent, new_full.name)
            new_full = new_full.parent / new_name
        
        new_full.parent.mkdir(parents=True, exist_ok=True)
        old_full.rename(new_full)

        update_md_refs(
            repo_root=Path(config.REPO_DIR),
            old_rel=old_full.relative_to(config.BASE_DIR).as_posix(),
            new_rel=new_full.relative_to(config.BASE_DIR).as_posix()
        )
                
        rel_path = new_full.relative_to(config.BASE_DIR).as_posix()
        return JSONResponse({"status": "saved", "newPath": rel_path})
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def images_in_folder(request: Request):
    """List images in specific folder for the project image picker"""
    folder = request.query_params.get("folder", "")
    
    try:
        folder = PathUtils.normalize_relative_path(folder)
    except ValueError:
        return JSONResponse([])
    
    static_dir = config.BASE_DIR / "_static"
    folder_path = static_dir / folder
    
    if not folder_path.is_dir():
        return JSONResponse([])
    
    return JSONResponse(
        FileUtils.scan_directory(folder_path, static_dir, list(config.ALLOWED_IMAGE_EXTS))
    )


async def get_image_tree(request: Request):
    """Get tree of all images in _static folder for the project image picker"""
    static_root = config.BASE_DIR / "_static"
    return JSONResponse(FileUtils.scan_directory(static_root, static_root))


async def upload_image(request: Request):
    """Upload image from outside of the project with collision handling"""
    form = await request.form()
    file = form.get("file")
    path = form.get("path", "")
    action = form.get("action", "check")
    
    if not isinstance(file, UploadFile):
        raise HTTPException(status_code=400, detail="No file provided")
    
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
            content = await file.read()
            f.write(content)
        
        rel_path = full_path.relative_to(config.BASE_DIR).as_posix()
        return JSONResponse({"status": "saved", "newPath": rel_path})
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# ==================== ROUTE HANDLERS END ==================== #


# ==================== GIT SECTION START ==================== #

async def search_file(request: Request):
    """Get git history for file"""
    data = await request.json()
    filename = data.get("filename", "")
    
    target_file = f"{config.DOCS_DIR}/{filename.replace('\\', '/')}" if filename else None
    
    try:
        if not repo.branches:
            return JSONResponse({
                "branches": [],
                "commits": {},
                "active_branch": None,
                "head_commit": None,
            })
        
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
        
        return JSONResponse({
            "branches": sorted(set(branches)),
            "commits": commits,
            "active_branch": active_branch,
            "head_commit": head_commit,
        })
    except Exception as e:
        print(f"Error in search_file: {e}")
        return JSONResponse({
            "branches": [],
            "commits": {},
            "active_branch": None,
            "head_commit": None,
        })


async def get_file_from_git(request: Request):
    """Get file content from two commits for diff"""
    data = await request.json()
    filename = data.get("filename")
    commit_left = data.get("commit_left")
    commit_right = data.get("commit_right")
    
    if not all([filename, commit_left, commit_right]):
        raise HTTPException(status_code=400, detail="Missing required parameters")
    
    left_content = git_utils.get_file_content(commit_left, filename)
    right_content = git_utils.get_file_content(commit_right, filename)
    
    return JSONResponse({
        "left_content": left_content,
        "right_content": right_content,
    })


async def git_diff_tree(request: Request):
    """Get diff between two commits"""
    commit_left = request.query_params.get("commit_left")
    commit_right = request.query_params.get("commit_right")
    
    if not commit_left or not commit_right:
        raise HTTPException(status_code=400, detail="Missing commit parameters")
    
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
    
    return JSONResponse(result)


async def git_head(request: Request):
    """Get current HEAD commit and active branch"""
    try:
        is_detached, active_branch = git_utils.check_head_status()
        
        return JSONResponse({
            "head": repo.head.commit.hexsha,
            "active_branch": active_branch
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def git_diff_working_tree(request: Request):
    """Compare working tree against commit"""
    commit = request.query_params.get("commit")
    
    if not commit:
        raise HTTPException(status_code=400, detail="Missing commit parameter")
    
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
        
        return JSONResponse(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def get_tree_union(request: Request):
    """Get union of files from two commits"""
    commit_left = request.query_params.get("commit_left")
    commit_right = request.query_params.get("commit_right")
    
    if not commit_left or not commit_right:
        raise HTTPException(status_code=400, detail="Missing commit parameters")
    
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
        
        return JSONResponse(filter_tree(local_tree))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def get_tree_local_diff(request: Request):
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
        
        return JSONResponse({"tree": filter_tree(local_tree), "diffs": result})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def git_commit_all(request: Request):
    """Commit changes to git"""
    try:
        data = await request.json()
        message = data.get("message", "(no message)")
        files = data.get("files", [])
        
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
        if files:
            for f in files:
                repo.git.add(os.path.join(config.DOCS_DIR, f))
        else:
            repo.git.add(all=True)
        
        # Commit
        new_commit = repo.index.commit(message)
        
        return JSONResponse({
            "status": "success",
            "commit": new_commit.hexsha,
            "summary": new_commit.summary,
            "active_branch": active_branch,
        })
    except GitCommandError as e:
        raise HTTPException(status_code=500, detail=str(e))


async def git_push(request: Request):
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
        
        return JSONResponse({
            "status": "success",
            "push_result": push_summary,
            "commit": repo.head.commit.hexsha,
            "active_branch": active_branch
        })
    except GitCommandError as e:
        error_msg = "Non-fast-forward" if "non-fast-forward" in str(e) else str(e)
        raise HTTPException(status_code=409, detail=error_msg)


async def git_pull(request: Request):
    """Pull from remote with rebase (only if remote branch exists)"""
    try:
        is_detached, active_branch = git_utils.check_head_status()

        if is_detached:
            raise HTTPException(
                status_code=400,
                detail="Repository is in detached HEAD state. Check out a branch first."
            )

        # --- ALWAYS fetch first ---
        repo.git.fetch("origin")

        remote_branch = f"origin/{active_branch}"

        # --- Check if matching remote branch exists ---
        remote_refs = {ref.name for ref in repo.refs}
        if remote_branch not in remote_refs:
            return JSONResponse(
                {
                    "status": "noop",
                    "reason": "REMOTE_BRANCH_MISSING",
                    "branch": active_branch,
                },
                status_code=200
            )

        # --- Original pull logic ---
        try:
            repo.git.pull("--rebase", "origin", active_branch)

        except GitCommandError as e:
            if "CONFLICT" in str(e) or "rebase" in str(e):
                # Abort rebase if in progress
                git_dir = Path(repo.git_dir)
                if any((git_dir / d).exists() for d in ("rebase-apply", "rebase-merge")):
                    try:
                        repo.git.rebase("--abort")
                    except Exception:
                        pass

                raise HTTPException(
                    status_code=409,
                    detail="Rebase conflict occurred"
                )
            raise

        return JSONResponse(
            {
                "status": "success",
                "active_branch": active_branch,
                "commit": repo.head.commit.hexsha,
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# async def git_hard_pull(request: Request):
#     try:
#         is_detached, active_branch = git_utils.check_head_status()

#         if is_detached:
#             raise HTTPException(
#                 status_code=400,
#                 detail="Repository is in detached HEAD state"
#             )

#         # Always fetch first
#         repo.git.fetch("origin")

#         remote_branch = f"origin/{active_branch}"

#         # Collect remote branches
#         remote_refs = {ref.name for ref in repo.refs}

#         if remote_branch not in remote_refs:
#             # Remote branch does not exist — do NOT force reset
#             return JSONResponse(
#                 {
#                     "status": "noop",
#                     "reason": "REMOTE_BRANCH_MISSING",
#                     "branch": active_branch,
#                 },
#                 status_code=200
#             )

#         # Force overwrite local branch
#         repo.git.reset("--hard", remote_branch)

#         # Optional cleanup
#         repo.git.clean("-fd")

#         return JSONResponse(
#             {
#                 "status": "success",
#                 "forced": True,
#                 "branch": active_branch,
#                 "commit": repo.head.commit.hexsha,
#             }
#         )

#     except HTTPException:
#         raise
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))


# ---- GET /api/git-status ----
async def git_status(request: Request):
    try:
        DOCS = config.DOCS_DIR

        # Modified / deleted / changed but unstaged (docs only)
        tracked_changes = repo.git.diff("--name-only", DOCS)

        # Staged changes (docs only)
        staged_changes = repo.git.diff("--name-only", "--cached", DOCS)

        # Untracked docs only
        untracked = repo.git.ls_files("--others", "--exclude-standard", DOCS).splitlines()

        has_changes = (
            bool(tracked_changes.strip()) or
            bool(staged_changes.strip()) or
            len(untracked) > 0
        )

        return JSONResponse({"has_uncommitted_changes": has_changes})

    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# ---- POST /api/git-checkout ----
async def git_checkout(request: Request):
    """
    Body:
        { "branch": "feature/x" }
    """
    try:
        data = await request.json()
        branch = data.get("branch")

        if not branch:
            return JSONResponse({"error": "Missing 'branch' field"}, status_code=400)

        # Checkout
        repo.git.checkout(branch)

        # Always pull to ensure latest
        try:
            repo.git.pull("--rebase")
        except Exception:
            # Some repos don’t need pull, or branch not tracked
            pass

        return JSONResponse({"ok": True})

    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


async def git_create_branch(request: Request):
    data = await request.json()
    branch = data.get("branch", "").strip()

    if not branch:
        raise HTTPException(status_code=400, detail="Branch name required")

    try:
        if branch in [b.name for b in repo.branches]:
            return JSONResponse({"error": f"Branch '{branch}' already exists"})

        new_branch = repo.create_head(branch)
        new_branch.checkout()

        return JSONResponse({"success": True, "branch": branch})

    except Exception as e:
        return JSONResponse({"error": str(e)})


# ==================== GIT SECTION END ==================== #


# ==================== STATIC SECTION START ==================== #

async def serve_static_files(request: Request):
    """Serve static files from _static directory"""
    subpath = request.path_params["subpath"]
    
    try:
        full_path = PathUtils.safe_join(config.BASE_DIR / "_static", subpath)
        
        if not full_path.is_file():
            raise HTTPException(status_code=404, detail="File not found")
        
        return FileResponse(full_path, headers={"Cache-Control": "no-cache, no-store, must-revalidate"})
    except ValueError:
        raise HTTPException(status_code=403, detail="Forbidden")


async def send_dictionaries(request: Request):
    """Serve dictionary files from frontend build"""
    path = request.path_params["path"]
    return FileResponse(config.STATIC_FOLDER / "dictionaries" / path)


async def get_templates(request: Request):
    """Serve template files from frontend build"""
    path = request.path_params["path"]
    return FileResponse(config.STATIC_FOLDER / "templates" / path)


async def serve_linked_template_list(request: Request):
    """Serve linked template list JSON"""
    return FileResponse(config.STATIC_FOLDER / "linkedtemplatelist.json")


async def save_uploaded_file(request: Request):
    """Save uploaded file to disk"""
    form = await request.form()
    file = form.get("file")
    filename = form.get("filename", "")
    
    if not filename:
        raise HTTPException(status_code=400, detail="Missing filename")
    
    if not isinstance(file, UploadFile):
        raise HTTPException(status_code=400, detail="No file provided")
    
    try:
        save_path = PathUtils.safe_join(config.BASE_DIR, filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    save_path.parent.mkdir(parents=True, exist_ok=True)
    
    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)
    
    return JSONResponse({"success": True, "path": str(save_path)})


# ==================== STATIC SECTION END ==================== #


# ==================== APPLICATION SETUP ====================


routes = [
    # File management routes
    Route("/api/tree", get_file_tree, methods=["GET"]),
    Route("/api/file", get_file, methods=["GET"]),
    Route("/api/file/meta", get_file_meta, methods=["GET"]),
    Route("/api/file", save_file, methods=["POST"]),
    Route("/api/create", create_file_or_folder, methods=["POST"]),
    Route("/api/delete", delete_path, methods=["POST"]),
    Route("/api/rename", rename_path, methods=["POST"]),
    
    # Image management routes
    Route("/api/images_in_folder", images_in_folder, methods=["GET"]),
    Route("/api/image_tree", get_image_tree, methods=["GET"]),
    Route("/api/upload_image", upload_image, methods=["POST"]),
    
    # Git operation routes
    Route("/search-file", search_file, methods=["POST"]),
    Route("/get-file-from-git", get_file_from_git, methods=["POST"]),
    Route("/api/git-diff-tree", git_diff_tree, methods=["GET"]),
    Route("/api/git-head", git_head, methods=["GET"]),
    Route("/api/git-diff-working-tree", git_diff_working_tree, methods=["GET"]),
    Route("/api/tree-union", get_tree_union, methods=["GET"]),
    Route("/api/tree-local-diff", get_tree_local_diff, methods=["GET"]),
    Route("/api/git-commit-all", git_commit_all, methods=["POST"]),
    Route("/api/git-push", git_push, methods=["POST"]),
    Route("/api/git-pull", git_pull, methods=["POST"]),
    # Route("/api/git-hard-pull", git_hard_pull, methods=["POST"]),
    Route("/api/git-status", git_status, methods=["GET"]),
    Route("/api/git-checkout", git_checkout, methods=["POST"]),
    Route("/api/git-create-branch", git_create_branch, methods=["POST"]),
    
    # Static file routes
    Route("/_static/{subpath:path}", serve_static_files, methods=["GET"]),
    Route("/dictionaries/{path:path}", send_dictionaries, methods=["GET"]),
    Route("/templates/{path:path}", get_templates, methods=["GET"]),
    Route("/linkedtemplatelist.json", serve_linked_template_list, methods=["GET"]),
    Route("/save", save_uploaded_file, methods=["POST"]),
    
    # Frontend static files (must be last)
    Mount("/", StaticFiles(directory=str(config.STATIC_FOLDER), html=True), name="frontend"),
]

middleware = [
    Middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Configure for production
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
]

app = Starlette(
    debug=True,
    routes=routes,
    middleware=middleware,
)


# ==================== APPLICATION ENTRY POINT ====================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=5000, reload=True)