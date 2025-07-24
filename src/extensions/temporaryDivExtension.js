import { ViewPlugin, Decoration, WidgetType } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

// Подключаем React и Excalidraw
import React from "https://esm.sh/react@19.0.0";
import { createRoot } from "https://esm.sh/react-dom@19.0.0/client";
import {
  Excalidraw,
  Footer,
  exportToBlob, 
  loadFromBlob 
} from "https://esm.sh/@excalidraw/excalidraw@0.18.0/dist/dev/index.js?external=react,react-dom";

let pluginInstance = null;

// Виджет с Excalidraw
class ExcalidrawWidget extends WidgetType {
  toDOM() {
    const wrapper = document.createElement("div");
    wrapper.style.border = "1px solid #ccc";
    wrapper.style.boxShadow = "0 2px 5px rgba(0,0,0,0.15)";
    wrapper.style.aspectRatio = "4/4";
    wrapper.style.width = "100%";
    wrapper.style.position = "relative";
    wrapper.style.overflow = "hidden";

    const appDiv = document.createElement("div");
    appDiv.style.height = "100%";
    wrapper.appendChild(appDiv);

    // ⬇️ Стили Excalidraw
    const existingLink = wrapper.querySelector('link[data-excalidraw-style]');
    if (!existingLink) {
      const styleLink = document.createElement("link");
      styleLink.setAttribute("rel", "stylesheet");
      styleLink.setAttribute("href", "https://esm.sh/@excalidraw/excalidraw@0.18.0/dist/dev/index.css");
      styleLink.setAttribute("data-excalidraw-style", "true");
      wrapper.insertBefore(styleLink, appDiv);
    }

    // ❌ Кнопка закрытия
    const closeButton = document.createElement("button");
    closeButton.textContent = "✖";
    closeButton.style.position = "absolute";
    closeButton.style.top = "4px";
    closeButton.style.right = "4px";
    closeButton.style.zIndex = "10";
    closeButton.style.cursor = "pointer";
    closeButton.onclick = () => {
      if (pluginInstance) pluginInstance.clear();
    };
    wrapper.appendChild(closeButton);

    const currentFileName = "excalidraw.png";

    const root = createRoot(appDiv);
    root.render(
      React.createElement(() => {
        const [excalidrawAPI, setExcalidrawAPI] = React.useState(null);
        const initialStatePromiseRef = React.useRef({ promise: null });

        // ✅ resolvablePromise — как в эталоне
        const resolvablePromise = () => {
          let resolve, reject;
          const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
          });
          promise.resolve = resolve;
          promise.reject = reject;
          return promise;
        };

        if (!initialStatePromiseRef.current.promise) {
          initialStatePromiseRef.current.promise = resolvablePromise();
        }

        // ✅ useEffect загрузки
        React.useEffect(() => {
          const loadScene = async () => {
            const filePath = `_static/main_section/${currentFileName}`;
            try {
              const response = await fetch(filePath);
              const blob = await response.blob();
              const sceneData = await loadFromBlob(blob);
              console.log("Scene loaded:", sceneData);
              initialStatePromiseRef.current.promise.resolve(sceneData);
            } catch (err) {
              console.error("Failed to load scene:", err);
              initialStatePromiseRef.current.promise.resolve({});
            }
          };
          loadScene();
        }, []);

        // ✅ Экспорт
        const handleExport = async () => {
          if (!excalidrawAPI) return;

          try {
            const blob = await exportToBlob({
              elements: excalidrawAPI.getSceneElements(),
              appState: { exportEmbedScene: true },
              scrollToContent: true,
              mimeType: "image/png",
              files: excalidrawAPI.getFiles(),
              exportPadding: 10
            });

            const formData = new FormData();
            formData.append("file", blob, currentFileName);

            const res = await fetch(`/save?filename=${encodeURIComponent(currentFileName)}`, {
              method: "POST",
              body: formData
            });

            if (res.ok) alert("✅ Saved to server.");
            else throw new Error("Server error");
          } catch (e) {
            console.error(e);
            alert("❌ Save failed.");
          }
        };

        return React.createElement(
          "div",
          { style: { height: "100%", width: "100%" } },
          React.createElement(
            Excalidraw,
            {
              excalidrawAPI: setExcalidrawAPI,
              initialData: initialStatePromiseRef.current.promise
            },
            React.createElement(
              Footer,
              null,
              React.createElement("button", { onClick: handleExport }, "📤 Save")
            )
          )
        );
      })
    );

    return wrapper;
  }

  ignoreEvent() {
    return false;
  }
}


// ViewPlugin для управления декорацией
export const temporaryDivPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.view = view;
    this.decorations = Decoration.none;
    pluginInstance = this;
  }

  update(update) {
    // Не обновляем автоматически
  }

  show() {
    const { state } = this.view;
    const line = state.doc.lineAt(state.selection.main.head);
    const builder = new RangeSetBuilder();

    builder.add(line.from, line.from, Decoration.widget({
      widget: new ExcalidrawWidget(),
      side: -1
    }));

    this.decorations = builder.finish();
    this.view.update([]);
  }

  clear() {
    this.decorations = Decoration.none;
    this.view.update([]);
  }

  destroy() {
    pluginInstance = null;
  }
}, {
  decorations: v => v.decorations || Decoration.none
});

// Экспортируем как расширение
export const temporaryDivExtension = [temporaryDivPlugin];

// Публичная функция для отображения
export function showTemporaryDiv() {
  if (pluginInstance) {
    pluginInstance.show();
  } else {
    console.warn("⚠️ temporaryDivPlugin not active");
  }
}
