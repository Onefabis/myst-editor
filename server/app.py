import os
import re
from flask import Flask, send_from_directory, jsonify, request
from flask_cors import CORS


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
    folder = request.args.get('folder', '')  # relative to _static
    static_dir = os.path.join(BASE_DIR, '_static')
    folder_path = os.path.join(static_dir, folder)
    if not os.path.isdir(folder_path):
        return jsonify([])

    allowed_exts = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg'}
    entries = []

    for entry in os.listdir(folder_path):
        full_path = os.path.join(folder_path, entry)
        rel_path = os.path.relpath(full_path, static_dir).replace('\\', '/')
        if os.path.isdir(full_path):
            entries.append({"type": "folder", "name": entry, "path": rel_path})
        elif os.path.splitext(entry)[1].lower() in allowed_exts:
            entries.append({"type": "file", "name": entry, "path": rel_path})

    return jsonify(entries)


# Function for the folder or file creation in the file tree on the left side panel
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


# Function for the file or folder deletion in the file tree on the left side panel
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


# Rename function for the files or folders in the file tree on the left side panel
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
    

# It collects the source path for thumbnails in the picker image window
@app.route('/_static/<path:subpath>')
def serve_source_files(subpath):
    static_dir = os.path.join(BASE_DIR, '_static')
    full_path = os.path.join(static_dir, subpath)

    if not os.path.commonpath([static_dir, os.path.abspath(full_path)]) == static_dir:
        return 'Forbidden', 403

    if os.path.isfile(full_path):
        directory = os.path.dirname(full_path)
        filename = os.path.basename(full_path)
        return send_from_directory(directory, filename)

    return 'File not found', 404
    

# Add dictionaries path for the spell-check support
@app.route('/dictionaries/<path:path>')
def send_dictionaries(path):
    response = send_from_directory(os.path.join(app.static_folder, 'dictionaries'), path)
    response.headers["Cache-Control"] = "public, max-age=31536000"
    return response
    # return send_from_directory(os.path.join(app.static_folder, 'dictionaries'), path)


# Add templates path for the correct templates integration
@app.route('/templates/<path:path>')
def get_templates(path):
    return send_from_directory(os.path.join(app.static_folder, 'templates'), path)


# Add the main template list json file that contains template_name:template_path values
@app.route('/linkedtemplatelist.json')
def serve_linked_template_list():
    return send_from_directory(app.static_folder, 'linkedtemplatelist.json')


@app.route('/api/image_tree', methods=['GET'])
def get_image_tree():
    static_root = os.path.join(BASE_DIR, '_static')

    def scan_dir(path):
        entries = []
        for entry in os.listdir(path):
            full_path = os.path.join(path, entry)
            rel_path = os.path.relpath(full_path, static_root).replace('\\', '/')
            if os.path.isdir(full_path):
                entries.append({
                    "type": "folder",
                    "name": entry,
                    "path": rel_path,
                    "children": scan_dir(full_path)
                })
        return entries

    return jsonify(scan_dir(static_root))


def sanitize_filename(filename):
    name, ext = os.path.splitext(filename)
    name = name.replace(' ', '_')
    return f"{name}{ext}"


def increment_filename(path, filename):
    name, ext = os.path.splitext(filename)
    match = re.search(r'(.*?)(\d+)$', name)

    if match:
        prefix = match.group(1)
        number = match.group(2)
        i = int(number) + 1
        width = len(number)
    else:
        prefix = name + '_'
        i = 1
        width = 4  # default padding

    while True:
        new_name = f"{prefix}{i:0{width}d}{ext}"
        if not os.path.exists(os.path.join(path, new_name)):
            return new_name
        i += 1


@app.route('/api/upload_image', methods=['POST'])
def upload_image():
    if 'file' not in request.files:
        return 'Missing file', 400

    uploaded_file = request.files['file']
    current_path = request.form.get('currentPath', '')
    if uploaded_file.filename == '':
        return 'No selected file', 400

    filename = sanitize_filename(uploaded_file.filename)
    current_path = current_path.replace('\\', '/').strip('/')
    parts = current_path.split('/')[:-1] if current_path else []

    source_root = os.path.join(BASE_DIR, '_static')
    target_folder = os.path.join(source_root, *parts)
    os.makedirs(target_folder, exist_ok=True)

    full_path = os.path.join(target_folder, filename)

    if os.path.exists(full_path):
        filename = increment_filename(target_folder, filename)
        full_path = os.path.join(target_folder, filename)

    uploaded_file.save(full_path)
    rel_path = os.path.relpath(full_path, source_root).replace('\\', '/')
    return jsonify({"savedPath": rel_path})


@app.route("/save", methods=["POST"])
def save_file():
    file = request.files["file"]
    raw_path = request.args.get("filename")

    if not raw_path:
        return jsonify({"error": "Missing filename"}), 400

    # Strip leading slash and normalize path
    safe_relative_path = os.path.normpath(raw_path.lstrip("/"))

    # Resolve full absolute path within BASE_DIR
    save_path = os.path.abspath(os.path.join(BASE_DIR, safe_relative_path))

    # SECURITY CHECK: ensure path is within BASE_DIR
    if not save_path.startswith(BASE_DIR):
        return jsonify({"error": "Invalid save path"}), 400

    # Ensure target directory exists
    os.makedirs(os.path.dirname(save_path), exist_ok=True)

    # Save file
    file.save(save_path)
    return jsonify({"success": True, "path": save_path})


if __name__ == '__main__':
    # app.run(ssl_context=('cert.pem', 'key.pem'), host='0.0.0.0', port=443)
    # serve(app, host='0.0.0.0', port=5000)
    app.run(host='0.0.0.0', port=5000, debug=True)
