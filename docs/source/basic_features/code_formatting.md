(source-basic_features-code_formatting_1._Code_formatting)=
# 1. Code formatting

(source-basic_features-code_formatting_1.1._Paste_text_as_code_block)=
## 1.1. Paste text as code block

```python
def hello():
    prhint("Hello")
```

## 1.2 External docs integration

We could use external links to another documentation like that: 

**External module:**
{external+python:py:mod}`zipapp`

**External function:**
{external+python:py:func}`zipapp.create_archive`

In this case this links are mapped to [python 3](https://docs.python.org/3), so if documentation will flip the base link to python 3.10, for instance, all doc references to external documentation will work correctly.



