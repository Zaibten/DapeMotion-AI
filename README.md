# ✨ DrapeMotion AI

### Turn Every Outfit Into a Cinematic Reel.

**DrapeMotion AI** is an AI-powered fashion video generation application that transforms ordinary dress photography into cinematic, vertical fashion videos.

Built with Node.js, OpenAI Vision, Sora Video Generation and FFmpeg, it analyzes outfit details, understands fashion inspiration videos, and generates professional-style fashion reels.

---

## 🌟 Features

- 👗 **AI Outfit Analysis** – Analyze clothing colors, fabric, embroidery, patterns, sleeves and other fashion details.
- 🎬 **AI Video Generation** – Generate cinematic fashion videos using OpenAI's video generation API.
- 📸 **Multiple Image Uploads** – Upload multiple outfit photographs for better clothing analysis.
- 🎥 **Reference Video Analysis** – Analyze reference reels to understand camera movements, lighting, poses and visual styles.
- 🧠 **Intelligent Prompt Enhancement** – Combine outfit descriptions and visual inspiration into an enhanced generation prompt.
- 📱 **Vertical Video Generation** – Create videos in a portrait 9:16 format.
- 🎨 **HD Video Processing** – Process generated videos using FFmpeg.
- 🚀 **Downloadable MP4** – Download the generated fashion reel.

## 🛠️ Technology Stack

| Technology | Purpose |
|---|---|
| Node.js | Backend runtime |
| Express.js | REST API and application server |
| OpenAI Vision | Outfit and reference analysis |
| OpenAI Video API | AI video generation |
| Sora 2 | Video generation model |
| Sharp | Image processing |
| FFmpeg | Video processing and encoding |
| Multer | File uploads |
| HTML, CSS, JavaScript | Frontend |

## ⚙️ How It Works

1. Upload one or more photographs of your outfit.
2. Optionally upload a fashion inspiration video.
3. Enter your desired fashion video prompt.
4. AI analyzes the outfit and visual inspiration.
5. The enhanced prompt is submitted to the video generation API.
6. The application monitors generation progress.
7. FFmpeg processes the generated video.
8. Download your finished fashion reel.

## 📂 Project Structure

```text
DrapeMotion-AI/
├── public/
│   └── index.html
├── outputs/
├── tmp/
├── server.js
├── package.json
├── .env.example
├── .gitignore
├── LICENSE
└── README.md
```

## 🚀 Installation

### Prerequisites

- Node.js 18 or newer
- FFmpeg installed and accessible through PATH
- OpenAI API key with access to the required models and video API

### 1. Clone Repository

```bash
git clone https://github.com/Zaibten/DrapeMotion-AI.git
```

### 2. Navigate to Project

```bash
cd DrapeMotion-AI
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Configure Environment

Copy `.env.example` to `.env`.

```env
OPENAI_API_KEY=your_openai_api_key
PORT=3000
VIDEO_MODEL=sora-2
VISION_MODEL=gpt-4o-mini
```

### 5. Start Application

```bash
npm start
```

Open:

```text
http://localhost:3000
```

## 🔐 Environment Variables

| Variable | Description |
|---|---|
| OPENAI_API_KEY | OpenAI API authentication key |
| PORT | Application server port |
| VIDEO_MODEL | Video generation model |
| VISION_MODEL | Image analysis model |

Never commit your `.env` file or expose your API key in frontend code.

## 🎥 Video Output

The application is designed for vertical fashion content, including:

- Instagram Reels
- TikTok videos
- YouTube Shorts
- Fashion product showcases
- Clothing promotional videos
- Digital fashion campaigns

**Note:** Actual output duration, resolution and model availability depend on the video API. The current implementation generates a 12-second source and trims it to 10 seconds.

## 🏢 Developed By

**Zaibten – Software Solutions**

Turning Ideas into Reality.

Website: https://zaibteninfo.com

GitHub: https://github.com/Zaibten

## 📜 License

This project is licensed under the MIT License.

---

⭐ If you find DrapeMotion AI useful, consider giving the repository a star!

**DrapeMotion AI — Fashion Meets Artificial Intelligence.**
