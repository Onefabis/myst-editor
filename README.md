# Doc Editor

**Doc Editor** is a web-based Markdown editor built on top of **[MyST Markdown]**.

MyST is essentially *Markdown on steroids*: it provides powerful, advanced features for creating rich technical documentation. With MyST, you can export your content to **HTML (web)**, **PDF**, **Markdown**, **LaTeX**, or **Sphinx** formats. Standard Markdown offers only limited capabilities for such workflows—this is where MyST truly stands out.

You can learn more in the official MyST guide:  
https://mystmd.org/guide/quickstart-myst-markdown

Doc Editor is a **non-destructive editor**. By default, it works with the `./docs` directory, which you can explore in the **Quick Start** section. You can also configure a custom `docs` path and use the web interface to create and edit `.md` files directly in your browser. Afterward, you can continue working in your favorite Markdown editor.

While you can do all your editing here, keep in mind that you won’t see the full power of MyST unless your local editor supports a MyST extension. You can always switch back to Doc Editor to take advantage of its full feature set.

## Key features

- **Git integration**  
  Compare branches and commits, create your own branches and commits, and pull or push changes directly from the editor.

- **Excalidraw integration**  
  Use Excalidraw whiteboards directly inside the text editor. The editor generates PNG images with the embedded Excalidraw scene, allowing you to reopen, modify, and re-save diagrams at any time.

- **Ollama integration**  
  With a configured model, you can ask questions about selected text in context or request automatic rephrasing of selected content.

## Quick start

Navigate to the root directory of the **Doc Editor** project and install dependencies:

```
npm i && npm run build
```
Start the server. You do not need to reinstall or rebuild unless you modify the source code:

```
npm run server
```
When you see the message “Application startup complete.”, open your browser and go to:

```
http://localhost:5000
```
The editor will open the introductory documentation located in the ./docs directory. From there, you can begin experimenting with MyST and editing your documentation.

## Advanced usage
Ensure that all dependencies listed in ./server/requirements.txt are installed in your Python virtual environment. Then run:

```
python app.py --repo_dir "RELATIVE_OR_ABSOLUTE_PATH_TO_YOUR_WORKING_DIRECTORY"
```

--repo_dir specifies your working directory. The editor can operate without Git in this location, but it is primarily designed to work with a Git repository. When Git is available, you gain full Git and GitHub integration features.

Copyright (c) 2022-2025 [Antmicro] https://github.com/antmicro/myst-editor/