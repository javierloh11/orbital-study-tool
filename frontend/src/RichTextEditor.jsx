import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

function RichTextEditor({ content, setContent }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content,
    onUpdate: ({ editor }) => {
      setContent(editor.getHTML());
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || "");
    }
  }, [content, editor]);

  if (!editor) return null;

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "12px",
          flexWrap: "wrap",
        }}
      >
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()}>
          Bold
        </button>

        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()}>
          Italic
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          Heading
        </button>

        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()}>
          Bullet List
        </button>

        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          Numbered List
        </button>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}

export default RichTextEditor;