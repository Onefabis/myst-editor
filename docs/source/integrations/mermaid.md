(source-integrations-mermaid_1._Mermaid_diagrams)=
# 1. Mermaid diagrams

User could create any mermaid diagram, mentioned [here](https://mermaid.js.org/intro/): 
~~~mermaid
    timeline
    title Project evolution example 2025 year:
    July : Firts init
    Auguts : File tree integration
         : Image upload
    September :  Harper and Excalidraw extensinos
    October : Git diff integration
    November: Git commit integration
    December: Sub-project management and fine-tuning
~~~


~~~mermaid
---
     title: Doc editor development flow
---
    graph LR 
    A -- Main fixes --> B
    B -- Feed --> A
    C -- Usecase feeds --> A
    B -- Approvement --> D
    A -- Usecase fixes --> D
    C --  Doc writing --> D
    
    A[Development]
    B[Head dev feedback]
    D(Release)
    C{Test dev team}

~~~