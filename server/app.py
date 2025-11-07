import os
import re
import shutil
from collections import defaultdict
from fastapi import FastAPI, File, Form, UploadFile, Request, Query, Body
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, List
from git import Repo, GitCommandError

# ---------------------- CONFIG ----------------------
DOCS_DIR = "docs"
BASE_DIR = os.path.abspath("../../" + DOCS_DIR)
STATIC_FOLDER = "../dist"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # adjust for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------- MODELS ----------------------
class PathModel(BaseModel):
    path: str
    type: Optional[str] = None


class RenameModel(BaseModel):
    oldPath: str
    newPath: str
    action: str = "check"  # "check" | "overwrite" | "increment"


# ---------------------- HELPERS ----------------------
def normalize_relative_path(path: str) -> str:
    """Normalize and sanitize a relative path."""
    # Convert backslashes → forward slashes
    path = path.replace("\\", "/").strip()
    # Remove any dangerous prefixes
    while path.startswith("../") or path.startswith("./") or path.startswith("/"):
        path = path.lstrip("./").lstrip("/")
    # Collapse redundant separators
    path = os.path.normpath(path).replace("\\", "/")
    # Prevent navigating above root
    if ".." in path.split("/"):
        raise ValueError("Invalid path: directory traversal detected")
    return path


def safe_join(base: str, *paths) -> str:
    """Join paths safely to prevent directory traversal."""
    paths = [normalize_relative_path(p) for p in paths]
    final_path = os.path.abspath(os.path.join(base, *paths))
    if not final_path.startswith(base):
        raise ValueError("Unsafe path")
    return final_path


def scan_dir(path: str, base: str, ext_filter: Optional[List[str]] = None):
    entries = []
    for entry in os.listdir(path):
        full_path = os.path.join(path, entry)
        rel_path = os.path.relpath(full_path, base).replace("\\", "/")
        if os.path.isdir(full_path):
            entries.append({
                "type": "folder",
                "name": entry,
                "path": rel_path,
                "children": scan_dir(full_path, base, ext_filter)
            })
        elif not ext_filter or os.path.splitext(entry)[1].lower() in ext_filter:
            entries.append({"type": "file", "name": entry, "path": rel_path})
    return entries


def sanitize_filename(filename):
    name, ext = os.path.splitext(filename)
    name = re.sub(r"[^a-zA-Z0-9_\-]", "_", name)  # Replace unsafe chars
    return f"{name}{ext}"


def increment_filename(path, filename):
    name, ext = os.path.splitext(filename)
    match = re.search(r"(.*?)(\d+)$", name)
    if match:
        prefix, number = match.groups()
        i = int(number) + 1
        width = len(number)
    else:
        prefix, i, width = name + "_", 1, 4
    while True:
        new_name = f"{prefix}{i:0{width}d}{ext}"
        if not os.path.exists(os.path.join(path, new_name)):
            return new_name
        i += 1

# ---------------------- ROUTES ----------------------


@app.get("/api/tree")
async def get_file_tree():
    return scan_dir(BASE_DIR, BASE_DIR, [".md"])


@app.get("/api/file")
async def get_file(path: str):
    try:
        full_path = safe_join(BASE_DIR, path)
        mtime = os.path.getmtime(full_path)  # seconds since epoch
        with open(full_path, "r", encoding="utf-8") as f:
            return {
                "content": f.read(),
                "last_modified": int(mtime * 1000)  # ms
            }
    except FileNotFoundError:
        return JSONResponse({"error": "File not found"}, status_code=404)
    except ValueError:
        return JSONResponse({"error": "Invalid path"}, status_code=400)


@app.get("/api/file/meta")
async def get_file_meta(path: str):
    try:
        full_path = safe_join(BASE_DIR, path)
        mtime = os.path.getmtime(full_path)
        return {"last_modified": int(mtime * 1000)}
    except FileNotFoundError:
        return JSONResponse({"error": "File not found"}, status_code=404)
    except ValueError:
        return JSONResponse({"error": "Invalid path"}, status_code=400)


@app.post("/api/file")
async def save_file(path: str, request: Request):
    try:
        full_path = safe_join(BASE_DIR, path)
    except ValueError:
        return JSONResponse({"error": "Invalid path"}, status_code=400)
    data = await request.json()
    content = data.get("content", "")
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)
    mtime = os.path.getmtime(full_path)
    return {
        "status": "saved",
        "last_modified": int(mtime * 1000)
    }


@app.get("/api/images_in_folder")
async def images_in_folder(folder: str = ""):
    try:
        folder = normalize_relative_path(folder)
    except ValueError:
        return []
    static_dir = os.path.join(BASE_DIR, "_static")
    folder_path = os.path.join(static_dir, folder)
    if not os.path.isdir(folder_path):
        return []
    allowed_exts = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".svg"}
    return scan_dir(folder_path, static_dir, allowed_exts)


@app.post("/api/create")
async def create_file_or_folder(data: PathModel):
    try:
        full_path = safe_join(BASE_DIR, data.path)
    except ValueError:
        return JSONResponse({"error": "Invalid path"}, status_code=400)
    if data.type == "folder":
        os.makedirs(full_path, exist_ok=True)
    elif data.type == "file":
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        open(full_path, "w", encoding="utf-8").close()
    return {"status": "created", "path": data.path}


@app.post("/api/delete")
async def delete_path(data: PathModel):
    try:
        full_path = safe_join(BASE_DIR, data.path)
    except ValueError:
        return JSONResponse({"error": "Invalid path"}, status_code=400)
    if not os.path.exists(full_path):
        return JSONResponse({"error": "File or folder does not exist"}, status_code=404)
    if os.path.isfile(full_path):
        os.remove(full_path)
    else:
        shutil.rmtree(full_path)
    return {"status": "deleted", "path": data.path}


# ------------------------------ COLLISION HANDLER ------------------------------
def handle_collision(base_dir, old_path=None, file: UploadFile = None,
                     new_path=None, action="check", move_file=False):
    try:
        new_full_path = safe_join(base_dir, new_path)
        os.makedirs(os.path.dirname(new_full_path), exist_ok=True)

        if action == "check":
            if os.path.exists(new_full_path):
                return JSONResponse({"collision": True}, status_code=409)
            if move_file:
                old_full_path = safe_join(base_dir, old_path)
                if not os.path.exists(old_full_path):
                    return JSONResponse({"error": "Source does not exist"}, status_code=404)
                os.rename(old_full_path, new_full_path)
            else:
                with open(new_full_path, "wb") as f:
                    shutil.copyfileobj(file.file, f)
            return {"status": "saved", "newPath": new_path}

        elif action == "overwrite":
            old_full_path = safe_join(base_dir, old_path)

            # If source and destination are the same file → do nothing
            if os.path.abspath(old_full_path) == os.path.abspath(new_full_path):
                return {"status": "no_change", "newPath": new_path}

            # If destination exists → delete it first
            if os.path.exists(new_full_path):
                os.remove(new_full_path)

            # Move or copy
            if move_file:
                os.rename(old_full_path, new_full_path)
            else:
                with open(new_full_path, "wb") as f:
                    shutil.copyfileobj(file.file, f)

            return {"status": "saved", "newPath": new_path}

        elif action == "increment":
            dir_path = os.path.dirname(new_full_path)
            filename = os.path.basename(new_full_path)
            new_name = increment_filename(dir_path, filename)
            final_path = os.path.join(dir_path, new_name)
            if move_file:
                old_full_path = safe_join(base_dir, old_path)
                os.rename(old_full_path, final_path)
            else:
                with open(final_path, "wb") as f:
                    shutil.copyfileobj(file.file, f)
            rel_path = os.path.relpath(final_path, base_dir).replace("\\", "/")
            return {"status": "saved", "newPath": rel_path}

        return JSONResponse({"error": "Invalid action"}, status_code=400)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"error": f"Internal Server Error: {str(e)}"}, status_code=500)


@app.post("/api/rename")
async def rename_path(data: RenameModel):
    try:
        # Normalize input paths
        old_path_clean = data.oldPath.lstrip("/").replace("\\", "/")
        new_path_clean = data.newPath.lstrip("/").replace("\\", "/")

        return handle_collision(
            base_dir=BASE_DIR,
            old_path=old_path_clean,
            new_path=new_path_clean,
            action=data.action,
            move_file=True
        )
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/upload_image")
async def upload_image(
    file: UploadFile = File(...),
    path: str = Form(...),
    action: str = Form("check")
):
    filename = sanitize_filename(file.filename)
    try:
        # Ensure path always starts inside _static
        normalized_path = normalize_relative_path(path)
        if not normalized_path.startswith("_static/"):
            normalized_path = f"_static/{normalized_path}"

        rel_path = os.path.join(normalized_path, filename).replace("\\", "/")
    except ValueError:
        return JSONResponse({"error": "Invalid path"}, status_code=400)

    return handle_collision(
        base_dir=BASE_DIR,
        file=file,
        new_path=rel_path,
        action=action,
        move_file=False
    )


@app.get("/api/image_tree")
async def get_image_tree():
    static_root = os.path.join(BASE_DIR, "_static")
    return scan_dir(static_root, static_root)


@app.post("/save")
async def save_uploaded_file(file: UploadFile = File(...), filename: str = ""):
    if not filename:
        return JSONResponse({"error": "Missing filename"}, status_code=400)
    try:
        safe_relative_path = normalize_relative_path(filename)
        save_path = safe_join(BASE_DIR, safe_relative_path)
    except ValueError:
        return JSONResponse({"error": "Invalid save path"}, status_code=400)
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    with open(save_path, "wb") as f:
        f.write(await file.read())
    return {"success": True, "path": save_path}


# ---------------------- STATIC FILE ROUTES ----------------------
@app.get("/_static/{subpath:path}")
async def serve_static_files(subpath: str):
    try:
        full_path = safe_join(os.path.join(BASE_DIR, "_static"), subpath)
    except ValueError:
        return JSONResponse({"error": "Forbidden"}, status_code=403)
    if os.path.isfile(full_path):
        headers = {"Cache-Control": "no-cache, no-store, must-revalidate"}
        return FileResponse(full_path, headers=headers)
    return JSONResponse({"error": "File not found"}, status_code=404)


@app.get("/dictionaries/{path:path}")
async def send_dictionaries(path: str):
    return FileResponse(os.path.join(STATIC_FOLDER, "dictionaries", path))


@app.get("/templates/{path:path}")
async def get_templates(path: str):
    return FileResponse(os.path.join(STATIC_FOLDER, "templates", path))


@app.get("/linkedtemplatelist.json")
async def serve_linked_template_list():
    return FileResponse(os.path.join(STATIC_FOLDER, "linkedtemplatelist.json"))

# ----------------------- Git integration ------------------------- #

repo_dir = "../../"

# Only open existing repo
if not os.path.exists(os.path.join(repo_dir, ".git")):
    raise FileNotFoundError(f"Git repo not found in {repo_dir}. Clone it manually first.")

repo = Repo(repo_dir)


class FileRequest(BaseModel):
    filename: str


class CompareRequest(BaseModel):
    branch: str
    commit: str
    filename: str
    current_text: str


@app.post("/search-file")
async def search_file(req: FileRequest):
    branches = []
    commits = {}
    target_file = f"{DOCS_DIR}/{req.filename.replace('\\', '/')}" if req.filename else None

    try:
        # Handle case where repo has no branches
        if not repo.branches:
            return {
                "branches": [],
                "commits": {},
                "active_branch": None,
                "head_commit": None,
            }

        # Process branches
        for branch in repo.branches:
            try:
                branch_name = branch.name
                branches.append(branch_name)
                commits[branch_name] = []

                # Handle case where branch has no commits
                branch_commits = list(repo.iter_commits(branch_name))
                if not branch_commits:
                    continue

                for idx, c in enumerate(branch_commits):
                    file_exists = True
                    if target_file:
                        try:
                            _ = c.tree / target_file
                        except KeyError:
                            file_exists = False
                        except Exception:
                            file_exists = False

                    commits[branch_name].append({
                        "hash": c.hexsha,
                        "summary": c.summary,
                        "message": c.message,
                        "index": idx + 1,  # chronological index (newest = 1)
                        "file_exists": file_exists
                    })
            except Exception as e:
                print(f"Error processing branch {branch_name}: {e}")
                continue

        # Handle active branch safely
        active_branch = None
        head_commit = None
        
        try:
            if not repo.head.is_detached and repo.active_branch:
                active_branch = repo.active_branch.name
        except Exception:
            pass

        try:
            if repo.head.commit:
                head_commit = repo.head.commit.hexsha
        except Exception:
            pass

        return {
            "branches": sorted(set(branches)),
            "commits": commits,
            "active_branch": active_branch,
            "head_commit": head_commit,
        }
        
    except Exception as e:
        print(f"Error in search_file: {e}")
        # Return safe defaults on any error
        return {
            "branches": [],
            "commits": {},
            "active_branch": None,
            "head_commit": None,
        }
    

class DiffRequest(BaseModel):
    filename: str
    branch_left: str
    commit_left: str
    branch_right: str
    commit_right: str

    
@app.post("/get-file-from-git")
async def get_file_from_git(req: DiffRequest):
    target_file = f"{DOCS_DIR}/{req.filename.replace('\\', '/')}"
    
    def read_file_from_commit(commit_hash: str) -> str:
        try:
            blob = repo.commit(commit_hash).tree / target_file
            return blob.data_stream.read().decode("utf-8").replace("\r", "")
        except KeyError:
            return f"// File not found in commit {commit_hash}"
        except Exception as e:
            return f"// Error reading file: {e}"

    left_content = read_file_from_commit(req.commit_left)
    right_content = read_file_from_commit(req.commit_right)

    return {
        "left_content": left_content,
        "right_content": right_content,
    }


@app.get("/api/git-diff-tree")
async def git_diff_tree_get(commit_left: str = Query(...), commit_right: str = Query(...)):
    commit_left_obj = repo.commit(commit_left)
    commit_right_obj = repo.commit(commit_right)

    diffs = commit_right_obj.diff(commit_left_obj, paths=DOCS_DIR)

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
    """
    Return the HEAD commit hash and active branch of the current repo.
    """
    try:
        return {
            "head": repo.head.commit.hexsha,
            "active_branch": repo.active_branch.name if not repo.head.is_detached else None
        }
    except Exception as e:
        return {"error": str(e)}


class CompareWorkingRequest(BaseModel):
    commit: str
    filename: str


@app.get("/api/git-diff-working-tree")
async def git_diff_working_tree(commit: str = Query(...)):
    """
    Compare the working tree against a given commit.
    Returns a list of changed files with statuses (M/A/D/R).
    Includes both tracked changes and untracked files.
    """
    try:
        result = []
        
        # Get tracked file changes: git diff --name-status <commit>
        diff_output = repo.git.diff("--name-status", commit, DOCS_DIR)
        for line in diff_output.splitlines():
            parts = line.split("\t")
            if not parts:
                continue
            status = parts[0]
            if status.startswith("R"):
                # Renamed: "R100 old new"
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
        
        # Get untracked files (new files not in git)
        untracked_files = repo.git.ls_files("--others", "--exclude-standard", DOCS_DIR).splitlines()
        for file_path in untracked_files:
            # Only include .md files
            if file_path.endswith('.md'):
                result.append({
                    "old_path": None,
                    "new_path": file_path,
                    "status": "A"  # Mark untracked files as "Added"
                })
        
        return result
    except Exception as e:
        return {"error": str(e)}


# Return union file tree for two selected commits
# Add this new endpoint to your FastAPI backend
@app.get("/api/tree-union")
async def get_tree_union(commit_left: str = Query(...), commit_right: str = Query(...)):
    try:
        # --- Get all .md files from both commits ---
        def get_md_files(commit_obj):
            files = set()
            try:
                docs_tree = commit_obj.tree / DOCS_DIR
                for item in docs_tree.traverse():
                    if item.type == 'blob' and item.path.endswith('.md'):
                        rel_path = os.path.relpath(item.path, DOCS_DIR).replace("\\", "/")
                        files.add(rel_path)
            except KeyError:
                pass
            return files

        left_files = get_md_files(repo.commit(commit_left))
        right_files = get_md_files(repo.commit(commit_right))
        
        # Union of files from both commits only (no untracked files for commit vs commit comparison)
        md_union = left_files | right_files

        # --- Get local tree ---
        local_tree = scan_dir(BASE_DIR, BASE_DIR, [".md"])

        # --- Filter local tree recursively ---
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

        filtered_local_tree = filter_tree(local_tree)
        return filtered_local_tree

    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/api/tree-local-diff")
async def get_tree_local_diff():
    """
    Return a *filtered local tree* that contains ONLY files that are
    modified (M) or added (A) in the working tree compared to HEAD.
    - Excludes deleted (D) and renamed (R) entries.
    - Returns: { tree: [...filtered tree nodes...], diffs: [...git-style diffs...] }
    """
    try:
        result = []
        changed_trimmed = set()

        # Try to get HEAD commit safely
        try:
            head_commit = repo.head.commit.hexsha
        except Exception:
            head_commit = None

        # 1) Get tracked changes compared to HEAD using same approach as git_diff_working_tree
        if head_commit:
            diff_output = repo.git.diff("--name-status", head_commit, DOCS_DIR)
            for line in diff_output.splitlines():
                parts = line.split("\t")
                if not parts:
                    continue

                status = parts[0]  # e.g. "M", "A", "D", or "R100"
                # Skip renames and deletes per requirement
                if status.startswith("R"):
                    continue
                if status not in ("M", "A", "D"):
                    continue

                # Typical lines: "M\tdocs/path/to/file.md" or "A\tdocs/newfile.md"
                path = parts[1] if len(parts) > 1 else None
                if not path:
                    continue
                if not path.endswith(".md"):
                    continue

                # Only keep M and A (explicitly ignore D)
                if status not in ("M", "A"):
                    continue

                old_path = path if status != "A" else None
                new_path = path if status != "D" else None

                result.append({"old_path": old_path, "new_path": new_path, "status": status})

                # For filtering tree we need trimmed path (without "docs/" prefix)
                p = new_path or old_path
                if p is None:
                    continue
                # Normalize slashes and drop "docs/" prefix if present
                p = p.replace("\\", "/")
                prefix = DOCS_DIR.rstrip("/") + "/"
                if p.startswith(prefix):
                    p = p[len(prefix):]
                changed_trimmed.add(p)

        # 2) Add untracked files (ls-files --others) -> treat as Added
        try:
            untracked = repo.git.ls_files("--others", "--exclude-standard", DOCS_DIR).splitlines()
            for file_path in untracked:
                if not file_path.endswith(".md"):
                    continue
                result.append({"old_path": None, "new_path": file_path, "status": "A"})
                p = file_path.replace("\\", "/")
                prefix = DOCS_DIR.rstrip("/") + "/"
                if p.startswith(prefix):
                    p = p[len(prefix):]
                changed_trimmed.add(p)
        except Exception:
            # If ls_files fails for some reason, just continue — we still return tracked changes
            pass

        # 3) Build local tree and filter it so only modified/added files and their folders remain
        local_tree = scan_dir(BASE_DIR, BASE_DIR, [".md"])

        def filter_tree(nodes):
            filtered = []
            for node in nodes:
                if node["type"] == "file":
                    if node["path"] in changed_trimmed:
                        # copy shallow to avoid mutating original
                        filtered.append({"type": node["type"], "name": node["name"], "path": node["path"]})
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

        filtered_local_tree = filter_tree(local_tree)
        return {"tree": filtered_local_tree, "diffs": result}

    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/git-commit-all")
async def git_commit_all(payload: dict = Body(...)):
    message = payload.get("message", "").strip() or "(no message)"
    files = payload.get("files", [])

    try:
        if repo.head.is_detached:
            return JSONResponse(
                {
                    "error": "HEAD_DETACHED",
                    "detail": "Repository is in a detached HEAD state — cannot commit. "
                              "Please check out a branch before retrying (e.g. 'git checkout main')."
                },
                status_code=400,
            )

        active_branch = repo.active_branch.name

        # Attempt to fetch latest from remote
        try:
            repo.remotes.origin.fetch()
        except Exception as fetch_err:
            print(f"Warning: could not fetch remote: {fetch_err}")

        remote_ref = f"origin/{active_branch}"
        local_commit = repo.commit(active_branch)

        if remote_ref in repo.refs:
            remote_commit = repo.commit(remote_ref)

            # Determine relationship between local and remote
            is_local_behind = repo.is_ancestor(local_commit, remote_commit)
            is_remote_behind = repo.is_ancestor(remote_commit, local_commit)

            if is_local_behind and not is_remote_behind:
                # Local is strictly behind remote
                return JSONResponse(
                    {
                        "error": "REMOTE_AHEAD",
                        "detail": f"Your branch '{active_branch}' is behind the remote. Please pull before committing.",
                    },
                    status_code=409,
                )

            if not is_local_behind and not is_remote_behind:
                # Branches have diverged (both have new commits)
                return JSONResponse(
                    {
                        "error": "DIVERGED",
                        "detail": f"Your branch '{active_branch}' has diverged from remote. Pull and resolve conflicts first.",
                    },
                    status_code=409,
                )

        # Stage changes
        if files:
            for f in files:
                repo.git.add(os.path.join(DOCS_DIR, f))
        else:
            repo.git.add(all=True)

        # Commit
        new_commit = repo.index.commit(message)
        return {
            "status": "success",
            "commit": new_commit.hexsha,
            "summary": new_commit.summary,
            "active_branch": active_branch,
        }

    except GitCommandError as e:
        return JSONResponse({"error": str(e)}, status_code=500)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/git-push")
async def git_push():
    try:
        if repo.head.is_detached:
            return JSONResponse(
                {
                    "error": "HEAD_DETACHED",
                    "detail": "Repository is in a detached HEAD state — cannot push/pull/sync. "
                              "Please check out a branch (e.g. 'git checkout main')."
                },
                status_code=400,
            )
        active_branch = repo.active_branch.name
        origin = repo.remotes.origin
        refspec = f"refs/heads/{active_branch}:refs/heads/{active_branch}"
        push_info = origin.push(refspec)
        return {"status": "success", "push_result": [str(info.summary) for info in push_info], "commit": repo.head.commit.hexsha, "active_branch": active_branch}
    except GitCommandError as e:
        return JSONResponse({"error": "NON_FAST_FORWARD" if "non-fast-forward" in str(e) else str(e)}, status_code=409)


@app.post("/api/git-pull")
async def git_pull():
    try:
        # --- Step 1: Handle detached HEAD early ---
        if repo.head.is_detached:
            return JSONResponse(
                {
                    "error": "HEAD_DETACHED",
                    "detail": (
                        "Repository is in a detached HEAD state — cannot pull.\n"
                        "Please check out a branch before retrying.\n\n"
                        "Example:\n  git checkout main"
                    ),
                },
                status_code=400,
            )

        # --- Step 2: Proceed with normal pull ---
        active_branch = repo.active_branch.name
        origin = repo.remotes.origin

        try:
            repo.git.pull("--rebase", "origin", active_branch)
        except GitCommandError as e:
            if "CONFLICT" in str(e) or "rebase" in str(e):
                repo.git.rebase("--abort")  # abort immediately so files aren't modified
                return JSONResponse({"error": "REBASE_CONFLICT"}, status_code=409)
            raise

        return {
            "status": "success",
            "commit": repo.head.commit.hexsha,
            "active_branch": active_branch,
        }

    except GitCommandError as e:
        if "CONFLICT" in str(e):
            return JSONResponse({"error": "REBASE_CONFLICT"}, status_code=409)
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/git-sync")
async def git_sync():
    """
    Perform a safe Git sync: pull (with rebase) + push.
    Handles broken refs, merge conflicts, and ensures the remote matches local HEAD.
    """
    try:
        if repo.head.is_detached:
            if repo.head.is_detached:
                return JSONResponse(
                    {
                        "error": "HEAD_DETACHED",
                        "detail": "Repository is in a detached HEAD state — cannot push/pull/sync. "
                                  "Please check out a branch (e.g. 'git checkout main')."
                    },
                    status_code=400,
                )

        active_branch = repo.active_branch.name
        if not repo.remotes:
            return JSONResponse({"error": "NO_REMOTE"}, status_code=400)

        origin = repo.remotes.origin
        git_dir = repo.git_dir

        # --- Step 0: Cleanup broken refs & rebase leftovers ---
        for bad_ref in ["ORIG_HEAD", "MERGE_HEAD"]:
            bad_path = os.path.join(git_dir, bad_ref)
            if os.path.exists(bad_path):
                try:
                    os.remove(bad_path)
                    print(f"Removed broken ref: {bad_ref}")
                except Exception:
                    pass

        if any(os.path.exists(os.path.join(git_dir, d)) for d in ["rebase-apply", "rebase-merge"]):
            return JSONResponse(
                {"error": "UNMERGED_FILES", "detail": "Rebase/merge in progress. Please resolve before syncing."},
                status_code=409,
            )

        # --- Step 1: Fetch remote ---
        origin.fetch()

        # --- Step 2: Stash local changes if any ---
        has_changes = repo.is_dirty(untracked_files=True)
        if has_changes:
            repo.git.stash("push", "-u", "-m", "auto-stash-before-sync")

        # --- Step 3: Pull with rebase ---
        try:
            repo.git.pull("--rebase", "--autostash", "origin", active_branch)
        except GitCommandError as e:
            err_msg = str(e)
            print("Pull error:", err_msg)
            if "ORIG_HEAD" in err_msg and "cannot lock ref" in err_msg:
                bad_ref = os.path.join(git_dir, "ORIG_HEAD")
                if os.path.exists(bad_ref):
                    os.remove(bad_ref)
                    print("Fixed broken ORIG_HEAD — retrying pull...")
                repo.git.pull("--rebase", "--autostash", "origin", active_branch)

            if "CONFLICT" in err_msg or "could not apply" in err_msg:
                return JSONResponse(
                    {"error": "REBASE_CONFLICT", "detail": "Conflicts detected during rebase."},
                    status_code=409,
                )

        # --- Step 4: Pop stash if used ---
        if has_changes:
            try:
                repo.git.stash("pop")
            except GitCommandError as e:
                if "CONFLICT" in str(e):
                    return JSONResponse(
                        {"error": "UNSTASH_CONFLICT", "detail": "Rebase succeeded, but local edits conflicted."},
                        status_code=409,
                    )

        # --- Step 5: Push explicitly to remote ---
        refspec = f"refs/heads/{active_branch}:refs/heads/{active_branch}"
        try:
            push_info_list = origin.push(refspec)
        except GitCommandError as e:
            err_msg = str(e)
            if "non-fast-forward" in err_msg.lower():
                return JSONResponse({"error": "NON_FAST_FORWARD"}, status_code=409)
            raise

        push_summary = []
        for info in push_info_list:
            summary_line = str(info.summary)
            push_summary.append(summary_line)
            if info.flags & info.ERROR:
                return JSONResponse(
                    {"error": f"Push failed: {summary_line or 'unknown error'}"},
                    status_code=500,
                )

        # --- Step 6: Verify remote matches local ---
        origin.fetch()
        local_commit = repo.head.commit.hexsha
        try:
            remote_commit = repo.commit(f"origin/{active_branch}").hexsha
        except Exception:
            remote_commit = None

        if remote_commit != local_commit:
            return JSONResponse(
                {
                    "error": "PUSH_NOT_APPLIED",
                    "detail": (
                        f"Local commit {local_commit[:7]} did not match remote {remote_commit[:7] if remote_commit else 'N/A'}."
                    ),
                },
                status_code=500,
            )

        latest_commit = repo.commit(local_commit)
        return {
            "status": "success",
            "message": f"Branch '{active_branch}' successfully synced (rebase + push).",
            "active_branch": active_branch,
            "commit": latest_commit.hexsha,
            "summary": latest_commit.summary,
            "push_result": push_summary,
        }

    except GitCommandError as e:
        return JSONResponse({"error": f"Git error: {str(e)}"}, status_code=500)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# Mount frontend
app.mount("/", StaticFiles(directory=STATIC_FOLDER, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=5000, reload=True)
