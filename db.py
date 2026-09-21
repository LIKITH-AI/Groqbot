import sqlite3
import json
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional

from contextlib import contextmanager

DB_PATH = "chitchat.db"

def set_db_path(path: str) -> None:
    global DB_PATH
    DB_PATH = path

@contextmanager
def get_connection(db_path: Optional[str] = None):
    target = db_path or DB_PATH
    conn = sqlite3.connect(target)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
    finally:
        conn.close()

def init_db(db_path: str = DB_PATH) -> None:
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                model TEXT DEFAULT 'llama-3.3-70b-versatile',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                attachments TEXT DEFAULT '[]',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_messages_conv_id ON messages(conversation_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_conv_updated_at ON conversations(updated_at DESC)")
        conn.commit()

def create_conversation(title: str = "New Chat", model: str = "openai/gpt-oss-120b", conv_id: Optional[str] = None) -> Dict[str, Any]:
    if not conv_id:
        conv_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO conversations (id, title, model, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
        """, (conv_id, title, model, now, now))
        conn.commit()
    return {"id": conv_id, "title": title, "model": model, "created_at": now, "updated_at": now}

def get_conversations(query: Optional[str] = None) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.cursor()
        if query:
            cursor.execute("""
                SELECT c.id, c.title, c.model, c.created_at, c.updated_at,
                       (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as message_count,
                       (SELECT content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message
                FROM conversations c
                WHERE c.title LIKE ? OR EXISTS (
                    SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.content LIKE ?
                )
                ORDER BY c.updated_at DESC
            """, (f"%{query}%", f"%{query}%"))
        else:
            cursor.execute("""
                SELECT c.id, c.title, c.model, c.created_at, c.updated_at,
                       (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as message_count,
                       (SELECT content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message
                FROM conversations c
                ORDER BY c.updated_at DESC
            """)
        rows = cursor.fetchall()
        return [dict(row) for row in rows]

def get_conversation(conv_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM conversations WHERE id = ?", (conv_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

def update_conversation_title(conv_id: str, new_title: str) -> bool:
    now = datetime.utcnow().isoformat()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE conversations
            SET title = ?, updated_at = ?
            WHERE id = ?
        """, (new_title, now, conv_id))
        conn.commit()
        return cursor.rowcount > 0

def touch_conversation(conv_id: str) -> None:
    now = datetime.utcnow().isoformat()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE conversations
            SET updated_at = ?
            WHERE id = ?
        """, (now, conv_id))
        conn.commit()

def delete_conversation(conv_id: str) -> bool:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM messages WHERE conversation_id = ?", (conv_id,))
        cursor.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
        conn.commit()
        return cursor.rowcount > 0

def clear_all_conversations() -> None:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM messages")
        cursor.execute("DELETE FROM conversations")
        conn.commit()

def add_message(conv_id: str, role: str, content: str, attachments: Optional[List[Dict[str, Any]]] = None, msg_id: Optional[str] = None) -> Dict[str, Any]:
    if not msg_id:
        msg_id = str(uuid.uuid4())
    attachments_json = json.dumps(attachments or [])
    now = datetime.utcnow().isoformat()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO messages (id, conversation_id, role, content, attachments, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (msg_id, conv_id, role, content, attachments_json, now))
        conn.commit()
    touch_conversation(conv_id)
    return {
        "id": msg_id,
        "conversation_id": conv_id,
        "role": role,
        "content": content,
        "attachments": attachments or [],
        "created_at": now
    }

def get_messages(conv_id: str) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, conversation_id, role, content, attachments, created_at
            FROM messages
            WHERE conversation_id = ?
            ORDER BY created_at ASC
        """, (conv_id,))
        rows = cursor.fetchall()
        result = []
        for row in rows:
            d = dict(row)
            try:
                d["attachments"] = json.loads(d["attachments"]) if d["attachments"] else []
            except Exception:
                d["attachments"] = []
            result.append(d)
        return result
