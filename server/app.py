from flask import Flask, send_from_directory, jsonify, request
import os
from flask_cors import CORS
from functools import lru_cache
from waitress import serve

app = Flask(__name__, static_folder='../dist', static_url_path='/')
CORS(app)
BASE_DIR = os.path.abspath('../../docs')  # editable content folder


@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')


@app.route('/api/tree', methods=['GET'])
def get_file_tree():
    def scan_dir(path):
        entries = []
        for entry in os.listdir(path):
            full_path = os.path.join(path, entry)
            rel_path = os.path.relpath(full_path, BASE_DIR)
            if os.path.isdir(full_path):
                entries.append({"type": "folder", "name": entry, "path": rel_path, "children": scan_dir(full_path)})
            elif entry.endswith(".md"):
                entries.append({"type": "file", "name": entry, "path": rel_path})
        return entries

    return jsonify(scan_dir(BASE_DIR))


@app.route('/api/file', methods=['GET', 'POST'])
def file_ops():
    path = request.args.get('path')
    safe_path = path.replace('\\', '/')
    full_path = os.path.join(BASE_DIR, safe_path)

    if request.method == 'GET':
        try:
            with open(full_path, 'r', encoding='utf-8') as f:
                return jsonify({"content": f.read()})
        except FileNotFoundError:
            return 'File not found', 404

    elif request.method == 'POST':
        content = request.json.get('content', '')
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return jsonify({"status": "saved"})


@app.route('/api/images_in_folder')
def images_in_folder():
    folder = request.args.get('folder', '')  # relative to BASE_DIR
    folder_path = os.path.join(BASE_DIR, folder)
    if not os.path.isdir(folder_path):
        return jsonify([])

    allowed_exts = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg'}
    entries = []

    for entry in os.listdir(folder_path):
        full_path = os.path.join(folder_path, entry)
        rel_path = os.path.relpath(full_path, BASE_DIR).replace('\\', '/')
        if os.path.isdir(full_path):
            entries.append({"type": "folder", "name": entry, "path": rel_path})
        elif os.path.splitext(entry)[1].lower() in allowed_exts:
            entries.append({"type": "file", "name": entry, "path": rel_path})

    return jsonify(entries)


@app.route('/api/images')
def list_images():
    allowed_exts = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg'}
    images = []

    def scan_images(path):
        result = []
        for entry in os.listdir(path):
            full_path = os.path.join(path, entry)
            rel_path = os.path.relpath(full_path, BASE_DIR).replace('\\', '/')
            if os.path.isdir(full_path):
                result.extend(scan_images(full_path))
            else:
                if os.path.splitext(entry)[1].lower() in allowed_exts:
                    result.append(rel_path)
        return result

    images = scan_images(BASE_DIR)
    return jsonify(images)


@app.route('/api/create', methods=['POST'])
def create_file_or_folder():
    path = request.json.get('path')
    type_ = request.json.get('type')
    full_path = os.path.join(BASE_DIR, path)
    if type_ == 'folder':
        os.makedirs(full_path, exist_ok=True)
    elif type_ == 'file':
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write('')
    return jsonify({"status": "created", "path": path})


@app.route('/api/delete', methods=['POST'])
def delete_path():
    path = request.json.get('path')
    if not path:
        return jsonify({'error': 'Missing path'}), 400

    full_path = os.path.join(BASE_DIR, path)

    if not os.path.commonpath([BASE_DIR, os.path.abspath(full_path)]) == BASE_DIR:
        return jsonify({'error': 'Invalid path'}), 403  # Prevent directory traversal

    if not os.path.exists(full_path):
        return jsonify({'error': 'File or folder does not exist'}), 404

    try:
        if os.path.isfile(full_path):
            os.remove(full_path)
        elif os.path.isdir(full_path):
            import shutil
            shutil.rmtree(full_path)
        return jsonify({'status': 'deleted', 'path': path})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/rename', methods=['POST'])
def rename_path():
    data = request.json
    old_path = data.get('oldPath')
    new_path = data.get('newPath')

    if not old_path or not new_path:
        return jsonify({'error': 'Missing oldPath or newPath'}), 400

    old_full_path = os.path.abspath(os.path.join(BASE_DIR, old_path))
    new_full_path = os.path.abspath(os.path.join(BASE_DIR, new_path))

    # Prevent directory traversal
    if not old_full_path.startswith(BASE_DIR) or not new_full_path.startswith(BASE_DIR):
        return jsonify({'error': 'Invalid path'}), 403

    if not os.path.exists(old_full_path):
        return jsonify({'error': 'Source path does not exist'}), 404

    try:
        os.makedirs(os.path.dirname(new_full_path), exist_ok=True)
        os.rename(old_full_path, new_full_path)
        return jsonify({'status': 'renamed', 'oldPath': old_path, 'newPath': new_path})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/_static/<path:filename>')
def serve_static_images(filename):
    static_dir = os.path.join(BASE_DIR, '_static')
    full_path = os.path.join(static_dir, filename)

    # Prevent directory traversal
    if not os.path.commonpath([static_dir, os.path.abspath(full_path)]) == static_dir:
        return 'Forbidden', 403

    return send_from_directory(static_dir, filename)
    

@app.route('/source/<path:subpath>')
def serve_source_files(subpath):
    # Compute the absolute path of the requested file
    full_path = os.path.abspath(os.path.join(BASE_DIR, subpath))

    # Security check: ensure the requested path is inside BASE_DIR to prevent directory traversal
    if not full_path.startswith(BASE_DIR):
        return 'Forbidden', 403

    # Serve the file if it exists and is a file
    if os.path.isfile(full_path):
        # send_from_directory needs the directory and filename separately
        directory = os.path.dirname(full_path)
        filename = os.path.basename(full_path)
        return send_from_directory(directory, filename)

    return 'File not found', 404
    

@app.route('/dictionaries/<path:path>')
def send_dictionaries(path):
    response = send_from_directory(os.path.join(app.static_folder, 'dictionaries'), path)
    response.headers["Cache-Control"] = "public, max-age=31536000"
    return response
    # return send_from_directory(os.path.join(app.static_folder, 'dictionaries'), path)


@app.route('/templates/<path:path>')
def get_templates(path):
    return send_from_directory(os.path.join(app.static_folder, 'templates'), path)


@app.route('/linkedtemplatelist.json')
def serve_linked_template_list():
    return send_from_directory(app.static_folder, 'linkedtemplatelist.json')


EXCALIDRAW_DIR = os.path.abspath('../../docs/_static/main_section')


@app.route("/save", methods=["POST"])
def save_file():
    file = request.files["file"]
    # Get filename from query parameter
    filename = request.args.get("filename", "excalidraw_saved.png")
    filename = os.path.basename(filename)
    save_path = os.path.join(EXCALIDRAW_DIR, filename)
    file.save(save_path)
    return jsonify({"success": True, "path": save_path})


if __name__ == '__main__':
    # app.run(ssl_context=('cert.pem', 'key.pem'), host='0.0.0.0', port=443)
    serve(app, host='0.0.0.0', port=5000)
