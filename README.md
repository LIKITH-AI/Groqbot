# 💬 chitchat — AI Chatbot Powered by Groq & Flask

**chitchat** is a modern, ultra-fast AI chatbot built with Python Flask and the Groq Cloud API. It features real-time streaming, multimodal image analysis, document parsing (PDF, Word, Code, CSV), audio transcription with real-time waveform visualization, and conversation history.

---

## ✨ Key Features

- **⚡ Ultra-Fast Streaming:** Real-time token streaming using Server-Sent Events (SSE) with typewriter cursor and zero lag.
- **📄 Multimodal Document Processing:** Upload and converse with PDF documents (`.pdf`), Microsoft Word (`.docx`), Python/JS/HTML code files, and tabular data (`.csv`, `.json`).
- **🖼️ Multimodal Vision Support:** Drop images (`.png`, `.jpg`, `.jpeg`, `.webp`) and let Groq's multimodal vision model (`llama-3.2-11b-vision-preview`) analyze photos, diagrams, architecture charts, and OCR text.
- **🎙️ Audio & Voice Input:** Click the microphone to record audio with a live Canvas waveform visualizer and get high-accuracy speech-to-text via Groq's `whisper-large-v3` API.
- **🗣️ Text-to-Speech (TTS):** One-click "Read" button on any bot response to listen via browser speech synthesis.
- **🕒 Browsing & Chat History:** Local SQLite database (`chitchat.db`) preserves all past chat sessions grouped by timeline ("Today", "Yesterday", "Older"), with live search, renaming, deletion, and export to Markdown/JSON.
- **🎨 Glassmorphic UI & Dark/Light Theme:** Built with pure HTML5, vanilla CSS, and vanilla JS. Features modern typography, syntax-highlighted code blocks with a one-click copy button, and mobile responsiveness.
- **🔒 Secure API Key Management:** Configure your Groq API key in `.env` or effortlessly set/update it from the in-app Settings modal without restarting the server.

---

## 🚀 Getting Started

### 1. Prerequisites
- Python 3.10+ (Installed in `.venv`)

### 2. Environment Configuration
Create or edit `.env` in the root folder:
```env
# Groq API Configuration
GROQ_API_KEY=gsk_your_actual_groq_api_key_here

# Flask Configuration
FLASK_PORT=5000
FLASK_DEBUG=True

# Models
DEFAULT_TEXT_MODEL=llama-3.3-70b-versatile
DEFAULT_VISION_MODEL=llama-3.2-11b-vision-preview
DEFAULT_AUDIO_MODEL=whisper-large-v3
```
*(Get your free Groq API key from [console.groq.com/keys](https://console.groq.com/keys))*

### 3. Run the Application
Activate the virtual environment and start the server:

```powershell
# In PowerShell:
.\.venv\Scripts\python.exe app.py
```

Then open your browser and navigate to:
**`http://localhost:5000`**

---

## 🛠️ Project Structure

```
chitchat/
├── .env                  # Groq API key & configuration
├── .env.example          # Template configuration
├── requirements.txt      # Python dependencies
├── app.py                # Main Flask application & Groq API routing
├── db.py                 # SQLite database storage for chat history
├── utils/
│   ├── __init__.py
│   └── file_parser.py    # Parsers for PDF, DOCX, text, and images
├── static/
│   ├── css/
│   │   └── style.css     # Glassmorphic CSS design system
│   └── js/
│       ├── app.js        # Main UI, streaming SSE handler & Markdown
│       ├── audio.js      # Microphone recording & Whisper transcription
│       └── history.js    # Sidebar chat sessions & history manager
└── templates/
    └── index.html        # Single-page modern interface
```

---

## 💡 Usage Tips

- **Keyboard Shortcut:** Press `Ctrl + K` or `Ctrl + N` anywhere to start a fresh chat session.
- **Code Highlighting:** All generated code blocks include a language badge and a one-click **Copy** button.
- **Exporting:** Click the download icon in the chat header to export your entire discussion as a clean `.md` Markdown file or `.json`.
- **Microphone:** Click the mic icon, grant microphone permissions, and speak. When finished, click **Done & Transcribe** to let Groq Whisper convert your speech to text.
