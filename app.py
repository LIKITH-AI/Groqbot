import os
import io
import json
import uuid
import re
from datetime import datetime
from flask import Flask, render_template, request, jsonify, Response, send_file
from dotenv import load_dotenv, set_key

# Load environment variables from .env
ENV_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
load_dotenv(ENV_FILE, override=True)

import db
from utils.file_parser import parse_uploaded_file
from groq import Groq

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50 MB max upload limit

# Initialize SQLite database
db.init_db()

def get_groq_client():
    load_dotenv(ENV_FILE, override=True)
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key or api_key == "your_groq_api_key_here":
        return None
    return Groq(api_key=api_key)

SYSTEM_PROMPT = """You are chitchat, a highly knowledgeable, articulate, and friendly AI assistant.
Your goal is to provide accurate, comprehensive, and well-structured answers to the user's questions.

Guidelines for your responses:
1. Accuracy & Depth: Ensure all explanations, facts, code, and insights are precise, correct, and thoroughly detailed.
2. Clear Structure: Use markdown formatting effectively:
   - Use headings (###, ####) to organize long responses.
   - Use bulleted or numbered lists for steps and items.
   - Use bold text for key terms and concepts.
   - Use tables when comparing options or summarizing data.
3. Code & Technical Details: Always wrap code in fenced markdown blocks with the exact language specified (e.g. ```python, ```javascript, ```sql). Explain how the code works and include best practices.
4. File & Image Context: If the user provides attached documents or images, carefully review and integrate all provided contents into your reasoning and cite key points directly.
5. Tone: Polite, enthusiastic, encouraging, and intellectually thorough.
"""

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/status", methods=["GET"])
def get_status():
    load_dotenv(ENV_FILE, override=True)
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    is_configured = bool(api_key and api_key != "your_groq_api_key_here" and len(api_key) > 10)
    
    masked_key = ""
    if is_configured:
        masked_key = api_key[:4] + "*" * (len(api_key) - 8) + api_key[-4:] if len(api_key) > 8 else "****"

    # Default fallback models
    available_models = {
        "text": [
            {"id": "openai/gpt-oss-120b", "name": "GPT OSS 120B (Groq)", "desc": "120B parameter state-of-the-art flagship reasoning model"},
            {"id": "openai/gpt-oss-20b", "name": "GPT OSS 20B (Groq)", "desc": "Ultra fast high-efficiency model"},
            {"id": "qwen/qwen3.8-27b", "name": "Qwen 3.8 27B", "desc": "High capacity reasoning & coding model"}
        ],
        "vision": [
            {"id": "llama-3.2-11b-vision-preview", "name": "Llama 3.2 11B Vision", "desc": "Multimodal model for images & diagrams"}
        ],
        "audio": [
            {"id": "whisper-large-v3", "name": "Whisper Large v3", "desc": "Multilingual speech recognition"},
            {"id": "whisper-large-v3-turbo", "name": "Whisper Large v3 Turbo", "desc": "Super fast speech-to-text"}
        ]
    }

    # Dynamically fetch available models from Groq account if key is configured
    client = get_groq_client()
    if client:
        try:
            account_models = [m.id for m in client.models.list().data]
            text_list = []
            for m_id in account_models:
                if any(x in m_id.lower() for x in ['guard', 'whisper', 'orpheus']):
                    continue
                name = m_id.split('/')[-1].replace('-', ' ').title()
                text_list.append({"id": m_id, "name": f"{name} ({m_id})", "desc": "Available on your Groq account"})
            if text_list:
                available_models["text"] = text_list
        except Exception as e:
            print("Error listing account models:", e)
    
    return jsonify({
        "status": "online",
        "api_key_configured": is_configured,
        "masked_key": masked_key,
        "default_text_model": os.getenv("DEFAULT_TEXT_MODEL", "openai/gpt-oss-120b"),
        "default_vision_model": os.getenv("DEFAULT_VISION_MODEL", "llama-3.2-11b-vision-preview"),
        "default_audio_model": os.getenv("DEFAULT_AUDIO_MODEL", "whisper-large-v3"),
        "available_models": available_models
    })

@app.route("/api/settings", methods=["POST"])
def update_settings():
    data = request.get_json() or {}
    new_key = data.get("groq_api_key", "").strip()
    new_text_model = data.get("default_text_model", "").strip()
    new_vision_model = data.get("default_vision_model", "").strip()

    try:
        if new_key:
            set_key(ENV_FILE, "GROQ_API_KEY", new_key)
            os.environ["GROQ_API_KEY"] = new_key
            
        if new_text_model:
            set_key(ENV_FILE, "DEFAULT_TEXT_MODEL", new_text_model)
            os.environ["DEFAULT_TEXT_MODEL"] = new_text_model

        if new_vision_model:
            set_key(ENV_FILE, "DEFAULT_VISION_MODEL", new_vision_model)
            os.environ["DEFAULT_VISION_MODEL"] = new_vision_model

        # Reload .env
        load_dotenv(ENV_FILE, override=True)
        return jsonify({"success": True, "message": "Settings updated successfully"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/conversations", methods=["GET"])
def list_conversations():
    q = request.args.get("q", "").strip()
    conversations = db.get_conversations(query=q if q else None)
    return jsonify({"conversations": conversations})

@app.route("/api/conversations", methods=["POST"])
def create_new_conversation():
    data = request.get_json() or {}
    title = data.get("title", "New Chat").strip() or "New Chat"
    model = data.get("model", os.getenv("DEFAULT_TEXT_MODEL", "llama-3.3-70b-versatile"))
    conv = db.create_conversation(title=title, model=model)
    return jsonify({"conversation": conv}), 201

@app.route("/api/conversations/<conv_id>", methods=["GET"])
def get_conversation_details(conv_id):
    conv = db.get_conversation(conv_id)
    if not conv:
        return jsonify({"error": "Conversation not found"}), 404
    messages = db.get_messages(conv_id)
    return jsonify({"conversation": conv, "messages": messages})

@app.route("/api/conversations/<conv_id>", methods=["PATCH"])
def rename_conversation(conv_id):
    data = request.get_json() or {}
    new_title = data.get("title", "").strip()
    if not new_title:
        return jsonify({"error": "Title cannot be empty"}), 400
    success = db.update_conversation_title(conv_id, new_title)
    if not success:
        return jsonify({"error": "Conversation not found"}), 404
    return jsonify({"success": True, "title": new_title})

@app.route("/api/conversations/<conv_id>", methods=["DELETE"])
def delete_conversation_route(conv_id):
    success = db.delete_conversation(conv_id)
    if not success:
        return jsonify({"error": "Conversation not found"}), 404
    return jsonify({"success": True})

@app.route("/api/conversations", methods=["DELETE"])
def clear_all():
    db.clear_all_conversations()
    return jsonify({"success": True, "message": "All conversations cleared"})

@app.route("/api/conversations/<conv_id>/export", methods=["GET"])
def export_conversation(conv_id):
    format_type = request.args.get("format", "markdown").lower()
    conv = db.get_conversation(conv_id)
    if not conv:
        return jsonify({"error": "Conversation not found"}), 404
    messages = db.get_messages(conv_id)

    if format_type == "json":
        data = {
            "conversation": conv,
            "messages": messages
        }
        buffer = io.BytesIO(json.dumps(data, indent=2).encode('utf-8'))
        safe_title = re.sub(r'[^a-zA-Z0-9_\-]', '_', conv['title'])[:30]
        return send_file(
            buffer,
            as_attachment=True,
            download_name=f"{safe_title}_{conv_id[:8]}.json",
            mimetype="application/json"
        )
    else:
        # Markdown export
        md_lines = [
            f"# {conv['title']}",
            f"*Exported from chitchat on {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}*",
            f"**Model:** {conv.get('model', 'llama-3.3-70b-versatile')}",
            "\n---\n"
        ]
        for msg in messages:
            role_label = "👤 **You**" if msg['role'] == "user" else "🤖 **chitchat**"
            created_at = msg.get('created_at', '')
            md_lines.append(f"### {role_label}  *({created_at})*\n")
            
            # Attachments summary if any
            if msg.get('attachments'):
                for att in msg['attachments']:
                    if att.get('type') == 'image':
                        md_lines.append(f"*(Attached Image: {att.get('filename')})*")
                    else:
                        md_lines.append(f"*(Attached Document: {att.get('filename')})*")
                md_lines.append("\n")
                
            md_lines.append(f"{msg['content']}\n\n---\n")

        buffer = io.BytesIO("\n".join(md_lines).encode('utf-8'))
        safe_title = re.sub(r'[^a-zA-Z0-9_\-]', '_', conv['title'])[:30]
        return send_file(
            buffer,
            as_attachment=True,
            download_name=f"{safe_title}_{conv_id[:8]}.md",
            mimetype="text/markdown"
        )

@app.route("/api/upload", methods=["POST"])
def upload_files():
    if 'files' not in request.files:
        return jsonify({"error": "No file part in the request"}), 400
    
    files = request.files.getlist('files')
    if not files or files[0].filename == '':
        return jsonify({"error": "No file selected"}), 400

    results = []
    for file in files:
        if file and file.filename:
            filename = file.filename
            mime_type = file.mimetype or "application/octet-stream"
            file_bytes = file.read()
            try:
                parsed = parse_uploaded_file(file_bytes, filename, mime_type)
                results.append(parsed)
            except Exception as e:
                results.append({
                    "type": "error",
                    "filename": filename,
                    "error": str(e)
                })
                
    return jsonify({"attachments": results})

@app.route("/api/transcribe", methods=["POST"])
def transcribe_audio():
    client = get_groq_client()
    if not client:
        return jsonify({
            "success": False,
            "error": "Groq API Key is not configured. Please add GROQ_API_KEY in your .env file or open Settings."
        }), 400

    if 'audio' not in request.files:
        return jsonify({"success": False, "error": "No audio file provided"}), 400

    audio_file = request.files['audio']
    if audio_file.filename == '':
        return jsonify({"success": False, "error": "Empty audio file"}), 400

    try:
        filename = audio_file.filename or "recording.webm"
        # Determine extension
        ext = os.path.splitext(filename)[1].lower()
        if not ext:
            ext = ".webm"
            filename += ext

        file_bytes = audio_file.read()
        audio_buffer = io.BytesIO(file_bytes)
        audio_buffer.name = filename

        audio_model = os.getenv("DEFAULT_AUDIO_MODEL", "whisper-large-v3")
        transcription = client.audio.transcriptions.create(
            file=(filename, audio_buffer.getvalue()),
            model=audio_model,
            response_format="json"
        )
        return jsonify({
            "success": True,
            "text": transcription.text
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Audio transcription failed: {str(e)}"
        }), 500

@app.route("/api/chat/stream", methods=["POST"])
def chat_stream():
    data = request.get_json() or {}
    conv_id = data.get("conversation_id")
    user_prompt = data.get("message", "").strip()
    attachments = data.get("attachments", [])
    model_override = data.get("model")

    if not conv_id:
        return jsonify({"error": "Conversation ID is required"}), 400

    conv = db.get_conversation(conv_id)
    default_text = os.getenv("DEFAULT_TEXT_MODEL", "openai/gpt-oss-120b")
    if not conv:
        # Auto-create if not exists
        conv = db.create_conversation(conv_id=conv_id, title="New Chat", model=default_text)

    # Check client
    client = get_groq_client()
    if not client:
        def err_stream():
            yield f"data: {json.dumps({'type': 'error', 'error': 'Groq API key not found. Please add GROQ_API_KEY to your .env file or configure it in Settings.'})}\n\n"
        return Response(err_stream(), mimetype="text/event-stream")

    # Add user message to DB
    db.add_message(
        conv_id=conv_id,
        role="user",
        content=user_prompt,
        attachments=attachments
    )

    # Fetch past messages to construct context window
    raw_history = db.get_messages(conv_id)
    # Exclude the message we just added so we can format it with attachments specifically
    past_messages = raw_history[:-1]

    has_images = any(att.get('type') == 'image' for att in attachments)
    
    # Choose appropriate model
    if model_override:
        active_model = model_override
    elif has_images and os.getenv("DEFAULT_VISION_MODEL") in ["llama-3.2-11b-vision-preview", "llama-3.2-90b-vision-preview"]:
        active_model = os.getenv("DEFAULT_VISION_MODEL", default_text)
    else:
        active_model = conv.get("model") or default_text

    if active_model == "llama-3.3-70b-versatile":
        active_model = default_text

    # Build Groq message list
    messages_payload = [{"role": "system", "content": SYSTEM_PROMPT}]

    # Include recent turns (up to last 16 messages) for multi-turn conversational context
    recent_past = past_messages[-16:] if len(past_messages) > 16 else past_messages
    for m in recent_past:
        content_text = m['content']
        # If past message had documents, include note
        if m.get('attachments'):
            doc_summaries = []
            for att in m['attachments']:
                if att.get('type') == 'document' and att.get('extracted_text'):
                    doc_summaries.append(f"[File: {att.get('filename')}]")
                elif att.get('type') == 'image':
                    doc_summaries.append(f"[Image: {att.get('filename')}]")
            if doc_summaries:
                content_text = f"({', '.join(doc_summaries)})\n{content_text}"
        messages_payload.append({
            "role": m['role'],
            "content": content_text
        })

    # Prepare current turn with full extracted documents and images
    current_text_parts = []
    if user_prompt:
        current_text_parts.append(user_prompt)

    # Append extracted text from documents
    for att in attachments:
        if att.get('type') == 'document' and att.get('extracted_text'):
            current_text_parts.append(f"\n--- Attached Document: {att.get('filename')} ---\n{att.get('extracted_text')}\n--- End of {att.get('filename')} ---\n")
        elif att.get('type') == 'image' and 'vision' not in active_model.lower():
            current_text_parts.append(f"\n[Attached Image: {att.get('filename')} (Previewed in UI)]\n")

    full_current_text = "\n".join(current_text_parts) if current_text_parts else "Please analyze the attached image/file."

    if has_images and 'vision' in active_model.lower():
        # Multimodal vision message payload
        user_content = [{"type": "text", "text": full_current_text}]
        for att in attachments:
            if att.get('type') == 'image' and att.get('data_url'):
                user_content.append({
                    "type": "image_url",
                    "image_url": {
                        "url": att.get('data_url')
                    }
                })
        messages_payload.append({
            "role": "user",
            "content": user_content
        })
    else:
        messages_payload.append({
            "role": "user",
            "content": full_current_text
        })

    def generate():
        assistant_full_response = []
        try:
            stream = client.chat.completions.create(
                model=active_model,
                messages=messages_payload,
                stream=True,
                temperature=0.7,
                max_tokens=4096
            )
            for chunk in stream:
                if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
                    token = chunk.choices[0].delta.content
                    assistant_full_response.append(token)
                    yield f"data: {json.dumps({'type': 'chunk', 'content': token})}\n\n"

            complete_text = "".join(assistant_full_response)
            
            # Save assistant message to DB
            bot_msg = db.add_message(
                conv_id=conv_id,
                role="assistant",
                content=complete_text
            )

            # Generate smart title if this is the first turn and title is "New Chat"
            if conv['title'] == "New Chat" and len(past_messages) == 0:
                generated_title = None
                try:
                    title_resp = client.chat.completions.create(
                        model="openai/gpt-oss-20b",
                        messages=[
                            {"role": "system", "content": "You are a title generator. Generate a concise, catchy, 3 to 6 word title summarizing the user's prompt. Do NOT use quotes, punctuation, or preamble. Return ONLY the title text."},
                            {"role": "user", "content": user_prompt[:200] if user_prompt else "Document query"}
                        ],
                        max_tokens=20,
                        temperature=0.5
                    )
                    candidate = title_resp.choices[0].message.content.strip().replace('"', '').replace("'", "")
                    if candidate and len(candidate) > 2:
                        generated_title = candidate[:45]
                except Exception:
                    # Fallback title from user prompt
                    words = user_prompt.split()
                    generated_title = " ".join(words[:5]) if words else "Conversation"
                    
                if generated_title:
                    db.update_conversation_title(conv_id, generated_title)
                    yield f"data: {json.dumps({'type': 'title', 'title': generated_title})}\n\n"

            yield f"data: {json.dumps({'type': 'done', 'message_id': bot_msg['id']})}\n\n"

        except Exception as e:
            err_msg = str(e)
            yield f"data: {json.dumps({'type': 'error', 'error': f'Groq Error: {err_msg}'})}\n\n"

    return Response(generate(), mimetype="text/event-stream")

if __name__ == "__main__":
    port = int(os.getenv("FLASK_PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "True").lower() in ("true", "1")
    print(f"Starting chitchat server at http://127.0.0.1:{port}")
    app.run(host="0.0.0.0", port=port, debug=debug)
