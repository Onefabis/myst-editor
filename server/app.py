import os
import re
import shutil
from fastapi import FastAPI, File, Form, UploadFile, Request, Query
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, List

from git import Repo
import difflib

# ---------------------- CONFIG ----------------------
BASE_DIR = os.path.abspath("../../docs")
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
@app.get("/")
async def index():
    index_file = os.path.join(STATIC_FOLDER, "index.html")
    return FileResponse(index_file)

@app.get("/api/tree")
async def get_file_tree():
    return scan_dir(BASE_DIR, BASE_DIR, [".md"])

@app.get("/api/file")
async def get_file(path: str):
    try:
        full_path = safe_join(BASE_DIR, path)
        with open(full_path, "r", encoding="utf-8") as f:
            return {"content": f.read()}
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
    return {"status": "saved"}

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

REMOTE_GIT_URL = "https://github.com/Onefabis/PFX_docs_project"


repo_dir = "F:/!Work/PFX_Studio/PFX_docs_project"
if not os.path.exists(os.path.join(repo_dir, ".git")):
    Repo.clone_from(REMOTE_GIT_URL, repo_dir)

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
    commits = []
    # target_file = req.filename.replace("\\", "/")  # normalize path
    target_file = f"docs/{req.filename.replace('\\', '/')}"
    for branch in repo.branches:
        branch_name = branch.name
        try:
            repo.git.checkout(branch_name)
            # try:
            _ = repo.head.commit.tree / target_file
            print(f"✅ Found in: {branch_name}")
            branches.append(branch_name)
            for commit in repo.iter_commits(branch_name, paths=target_file):
                commits.append({
                    "hash": commit.hexsha,
                    "summary": commit.summary,
                    "message": commit.message
                })
            # except KeyError:
                # continue  # file not found in this branch
        except Exception as e:
            print(f"❌ Error in branch {branch_name}: {e}")
            continue
    return {
        "branches": sorted(set(branches)),
        "commits": commits
    }

@app.post("/compare")
async def compare_file(req: CompareRequest):
    repo.git.checkout(req.branch)
    file_content = ""

    try:
        blob = repo.commit(req.commit).tree / req.filename
        file_content = blob.data_stream.read().decode("utf-8")
    except Exception as e:
        return JSONResponse(status_code=404, content={"error": str(e)})

    diff = difflib.unified_diff(
        file_content.splitlines(),
        req.current_text.splitlines(),
        fromfile='remote',
        tofile='current',
        lineterm=''
    )
    return {"diff": "\n".join(diff)}

@app.post("/get-file-from-git")
async def get_file_from_git(req: CompareRequest):
    repo.git.checkout(req.branch)
    target_file = f"docs/{req.filename.replace('\\', '/')}"
    try:
        blob = repo.commit(req.commit).tree / target_file
        content = blob.data_stream.read().decode("utf-8").replace('\r', '')
        return {"content": content}
    except Exception as e:
        return JSONResponse(status_code=404, content={"error": str(e)})

@app.get("/api/git-commit-info")
async def get_commit_info(branch: str = Query(...), commit: str = Query(...), filename: str = Query(...)):
    try:
        repo.git.checkout(branch)
        c = repo.commit(commit)
        return {
            "summary": c.summary,
            "message": c.message
        }
    except Exception as e:
        return JSONResponse(status_code=400, content={"error": str(e)})

# Mount frontend
app.mount("/", StaticFiles(directory=STATIC_FOLDER, html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=5000, reload=True)
