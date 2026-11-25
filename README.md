# Gemini AI Chatbot – ChatGPT-Style Local Web Application

[Python](https://img.shields.io/badge/Python-3.10+-blue?style=for-the-badge&logo=python&logoColor=white) [Flask](https://img.shields.io/badge/Flask-Web_Framework-black?style=for-the-badge&logo=flask&logoColor=white) [Google Gemini](https://img.shields.io/badge/Google-Gemini_API-8E75B2?style=for-the-badge&logo=googlegemini&logoColor=white) [JavaScript](https://img.shields.io/badge/JavaScript-ES6+-yellow?style=for-the-badge&logo=javascript&logoColor=black) [HTML5](https://img.shields.io/badge/HTML5-Markup-orange?style=for-the-badge&logo=html5&logoColor=white) [CSS3](https://img.shields.io/badge/CSS3-Styling-blue?style=for-the-badge&logo=css3&logoColor=white)

[GitHub stars](https://img.shields.io/github/stars/banerjeeanushree7-gif/Chatbot?style=social) [GitHub forks](https://img.shields.io/github/forks/banerjeeanushree7-gif/Chatbot?style=social) [GitHub issues](https://img.shields.io/github/issues/banerjeeanushree7-gif/Chatbot) [GitHub last commit](https://img.shields.io/github/last-commit/banerjeeanushree7-gif/Chatbot) [GitHub repo size](https://img.shields.io/github/repo-size/banerjeeanushree7-gif/Chatbot) [GitHub top language](https://img.shields.io/github/languages/top/banerjeeanushree7-gif/Chatbot)

---

## 📌 Project Overview

**Gemini AI Chatbot** is a locally hosted, ChatGPT-style web application powered by Google's Gemini API. It provides an interactive conversational interface where users can ask questions, receive AI-generated responses, upload files and continue conversations with contextual memory.

The application is developed using Python and Flask for backend functionality, while HTML, CSS and JavaScript handle the frontend interface. Google's Gemini API is integrated to generate intelligent responses, with support for real-time streaming so that answers appear progressively as they are generated.

The chatbot also includes conversation management, message editing, chat searching, Markdown rendering and file attachment capabilities, providing a smooth and user-friendly AI chat experience.

## 🚀 Key Features

### 🤖 AI-Powered Conversations

- Integrates Google's Gemini API for AI-generated responses.
- Provides a ChatGPT-style conversational interface.
- Maintains contextual memory within individual conversations.
- Supports multiple Gemini models through a model selector.
- Allows users to regenerate responses.

### ⚡ Real-Time Streaming Responses

- Displays AI-generated text progressively.
- Provides a Stop button to interrupt response generation.
- Preserves partially generated responses when stopped.
- Improves the overall conversational experience.

### 📎 File Upload & Attachment Support

- Supports image, PDF and text/code file attachments.
- Accepts PNG, JPG, WEBP and GIF image formats.
- Supports drag-and-drop file uploads and image pasting.
- Processes images as visual inputs for Gemini.
- Extracts selectable text from PDF and text files.
- Supports up to 5 files per message, with a maximum size of 10 MB per file.

### 💬 Conversation Management

- Creates and saves multiple conversations.
- Allows users to rename existing chats.
- Supports searching conversations by title or message content.
- Provides options to create new chats and delete existing ones.
- Maintains conversation history between visits.
- Allows users to edit previously sent messages and regenerate the conversation from that point.

### 📝 Enhanced Chat Interface

- Supports Markdown rendering, including headings, lists, tables and links.
- Displays syntax-highlighted code blocks.
- Includes copy buttons for code blocks and complete AI responses.
- Supports multi-line message input.
- Uses `Enter` to send messages and `Shift + Enter` to insert a new line.
- Provides a collapsible sidebar for mobile devices.

### 🔒 Local Data Storage

- Stores conversations locally in JSON format.
- Saves uploaded files in the local uploads directory.
- Uses file locking and atomic writes to improve data consistency.
- Automatically removes associated uploaded files when a conversation is deleted.

## 🧠 Working Methodology

The application follows a structured request-response workflow:

1. **User Input:** The user enters a question or message through the chatbot interface.
2. **File Attachment:** Users can optionally attach images, PDFs or text/code files.
3. **Backend Processing:** Flask receives the message and processes the attached files.
4. **Context Management:** Previous conversation messages are retrieved to maintain conversational context.
5. **Gemini API Integration:** The processed request is sent to Google's Gemini API.
6. **Response Generation:** Gemini generates an AI-powered response, which is streamed to the frontend.
7. **Response Rendering:** JavaScript displays the response with Markdown formatting and syntax highlighting.
8. **Conversation Storage:** Messages are saved locally in JSON format for future access.

## 🛠️ Tech Stack

### Programming Language
- Python

### Backend Development
- Flask
- REST API Integration

### Artificial Intelligence
- Google Gemini API
- Gemini Generative Models

### Frontend Development
- HTML5
- CSS3
- JavaScript

### UI & Content Rendering
- Tailwind CSS
- Marked.js
- DOMPurify
- Highlight.js

### Data Storage
- JSON
- Local File Storage

### Development Tools
- Visual Studio Code
- Command Prompt
- Python Virtual Environment

## 📂 Project Structure

```text
Chatbot/
│
├── app.py
│
├── templates/
│   └── index.html
│
├── static/
│   ├── css/
│   ├── js/
│   └── ...
│
├── data/
│   ├── conversations.json
│   └── uploads/
│
├── .env.example
├── .gitignore
├── requirements.txt
└── README.md
```

*Note: The structure above represents the main application components. Actual filenames and directories may vary depending on your repository.*

## ⚙️ Getting Started

Follow these steps to run the project on your local machine.

### 1. Clone the Repository

```bash
git clone https://github.com/banerjeeanushree7-gif/Chatbot.git
```

### 2. Navigate to the Project Directory

```bash
cd Chatbot
```

### 3. Create a Virtual Environment (Optional)

```bash
python -m venv venv
```

Activate the environment:

**Windows:**

```bash
venv\Scripts\activate
```

### 4. Install Required Dependencies

```bash
pip install -r requirements.txt
```

### 5. Get a Google Gemini API Key

1. Visit [Google AI Studio](https://aistudio.google.com/).
2. Sign in using your Google account.
3. Generate an API key.
4. Copy the API key for application configuration.

### 6. Configure Environment Variables

Copy `.env.example` and rename the copy to `.env`.

**Windows Command Prompt:**

```cmd
copy .env.example .env
```

Open the `.env` file and add your Gemini API key:

```env
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.5-flash
GEMINI_MODELS=gemini-3.5-flash,gemini-3.5-flash-lite
MAX_HISTORY_MESSAGES=40
FLASK_DEBUG=1
```

**Note:** The model names above reflect the original configuration. If a model is unavailable, replace it with a currently supported Gemini model.

### 7. Run the Application

```bash
python app.py
```

### 8. Open the Chatbot

Open your web browser and visit:

```text
http://127.0.0.1:5001
```

The chatbot is now ready to use!

## ⚙️ Configuration

The application uses environment variables stored in the `.env` file.

| Variable | Default Value | Description |
|---|---|---|
| `GEMINI_API_KEY` | Not set | Google Gemini API key (required) |
| `GEMINI_MODEL` | `gemini-3.5-flash` | Default Gemini model |
| `GEMINI_MODELS` | `gemini-3.5-flash,gemini-3.5-flash-lite` | Comma-separated list of models available in the dropdown |
| `MAX_HISTORY_MESSAGES` | `40` | Maximum number of recent messages sent to the model |
| `FLASK_DEBUG` | `1` | Enables Flask debug mode; set to `0` outside local development |

## 💾 Data Storage

The application maintains its data locally on the user's machine.

| Storage Location | Purpose |
|---|---|
| `data/conversations.json` | Stores conversation history and messages |
| `data/uploads/` | Stores uploaded files |
| `.env` | Stores API credentials and application configuration |

Conversation data is maintained between application sessions. Deleting a conversation also removes its associated uploaded files.

## 🔐 Security & Important Notes

- Never upload or commit your actual `.env` file to GitHub.
- Keep your Gemini API key private.
- Avoid sharing confidential or sensitive information through the Gemini free tier.
- Google may apply usage limits to free-tier API requests.
- Scanned PDFs without selectable text are not supported by the current text-extraction workflow.
- The frontend uses external CDNs for Tailwind CSS, Marked.js, DOMPurify and Highlight.js, so an internet connection is required for these resources.
- Use `FLASK_DEBUG=0` when running outside local development.

## 🔮 Future Improvements

The project can be further enhanced through:

- User authentication and individual chat histories.
- Database integration using MySQL or PostgreSQL.
- Support for additional AI model providers.
- Voice input and text-to-speech functionality.
- Improved file processing for scanned PDFs using OCR.
- Chat export functionality in PDF and TXT formats.
- Deployment on cloud hosting platforms.
- Enhanced mobile responsiveness and UI customization.

## 🤝 Contributing

Contributions, suggestions and improvements are welcome!

1. Fork this repository.
2. Create a new feature branch.
3. Commit your changes.
4. Push the branch to GitHub.
5. Open a Pull Request.

## 👩‍💻 Author

**Anushree Banerjee**

B.Tech Computer Science & Engineering Student

**Areas of Interest:** Artificial Intelligence | Machine Learning | Deep Learning | Web Development

🌐 **LinkedIn:** [Anushree Banerjee](https://www.linkedin.com/in/anushree-banerjee-4086b135a/)

🐙 **GitHub:** [banerjeeanushree7-gif](https://github.com/banerjeeanushree7-gif)

---

### ⭐ If you find this project interesting, consider giving it a star!

**Built with Python, Flask and Google Gemini API.**
