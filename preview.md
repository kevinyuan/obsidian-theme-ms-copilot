# Theme Preview

## Chat Bubbles

> [!chat-r]  
> This is a right-aligned chat bubble.

> [!chat-l]  
> This is a left-aligned chat bubble.

---

## Table

| Feature         | Status | Notes                    |
|-----------------|--------|--------------------------|
| Warm background | Done   | Cream `rgb(248,244,242)` |
| Rounded tables  | Done   | 8px border radius        |
| Chat bubbles    | Done   | `chat-r` and `chat-l`   |
| Code blocks     | Done   | Dark with language label |

---

## Blockquote

> Design is not just what it looks like and feels like. Design is how it works.

---

## Code Block

```python
from typing import List


class DataProcessor:
    def __init__(self, scale: float = 1.0):
        self.scale = scale

    def transform(self, values: List[int]) -> List[float]:
        return [v * self.scale for v in values]
```

---

## Lists

- First item
- Second item
  - Nested item
  - Another nested item
- Third item

1. Step one
2. Step two
3. Step three
