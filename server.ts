import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { OAuth2Client } from "google-auth-library";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("agents.db");

const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT,
    google_id TEXT UNIQUE
  );

  CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT NOT NULL,
    description TEXT,
    system_instruction TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    type TEXT DEFAULT 'text',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    image TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
  );
`);

// Migration: Add columns if they don't exist
try {
  db.prepare("ALTER TABLE agents ADD COLUMN user_id INTEGER").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE agents ADD COLUMN type TEXT DEFAULT 'text'").run();
} catch (e) {}

// Seed a default user if none exists
const userCount = db.prepare("SELECT count(*) as count FROM users").get() as { count: number };
if (userCount.count === 0) {
  db.prepare("INSERT INTO users (email, password) VALUES (?, ?)").run("admin@aiforge.com", "admin123");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Auth Routes
  app.get("/api/auth/google/url", (req, res) => {
    const redirectUri = `${process.env.APP_URL}/auth/google/callback`;
    const url = googleClient.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'],
      redirect_uri: redirectUri
    });
    res.json({ url });
  });

  app.get("/auth/google/callback", async (req, res) => {
    const { code } = req.query;
    const redirectUri = `${process.env.APP_URL}/auth/google/callback`;
    
    try {
      const { tokens } = await googleClient.getToken({
        code: code as string,
        redirect_uri: redirectUri
      });
      googleClient.setCredentials(tokens);

      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      });
      const userInfo = await userInfoRes.json();

      // Find or create user
      let user = db.prepare("SELECT * FROM users WHERE google_id = ? OR email = ?").get(userInfo.sub, userInfo.email) as any;
      
      if (!user) {
        const info = db.prepare("INSERT INTO users (email, google_id) VALUES (?, ?)").run(userInfo.email, userInfo.sub);
        user = { id: info.lastInsertRowid, email: userInfo.email };
      } else if (!user.google_id) {
        db.prepare("UPDATE users SET google_id = ? WHERE id = ?").run(userInfo.sub, user.id);
      }

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'OAUTH_AUTH_SUCCESS', 
                  user: { id: ${user.id}, email: '${user.email}' } 
                }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Autenticação bem-sucedida. Esta janela fechará automaticamente.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Google Auth Error:", error);
      res.status(500).send("Erro na autenticação com Google");
    }
  });

  app.post("/api/login", (req, res) => {
    const { email, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE email = ? AND password = ?").get(email, password);
    if (user) {
      res.json({ id: user.id, email: user.email });
    } else {
      res.status(401).json({ error: "Credenciais inválidas" });
    }
  });

  app.post("/api/register", (req, res) => {
    const { email, password } = req.body;
    try {
      const info = db.prepare("INSERT INTO users (email, password) VALUES (?, ?)").run(email, password);
      res.json({ id: info.lastInsertRowid, email });
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT') {
        res.status(400).json({ error: "E-mail já cadastrado" });
      } else {
        res.status(500).json({ error: "Erro ao criar conta" });
      }
    }
  });

  // API Routes
  app.get("/api/agents", (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
      return res.json([]);
    }
    const agents = db.prepare("SELECT * FROM agents WHERE user_id = ? ORDER BY created_at DESC").all(userId);
    res.json(agents);
  });

  app.post("/api/agents", (req, res) => {
    try {
      const { name, description, system_instruction, icon, color, userId, type } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }
      const info = db.prepare(
        "INSERT INTO agents (name, description, system_instruction, icon, color, user_id, type) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(name, description, system_instruction, icon, color, userId, type || 'text');
      
      const newAgent = db.prepare("SELECT * FROM agents WHERE id = ?").get(info.lastInsertRowid);
      res.json(newAgent);
    } catch (error: any) {
      console.error("Error creating agent:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/agents/:id", (req, res) => {
    try {
      const { name, description, system_instruction, icon, color, type } = req.body;
      db.prepare(
        "UPDATE agents SET name = ?, description = ?, system_instruction = ?, icon = ?, color = ?, type = ? WHERE id = ?"
      ).run(name, description, system_instruction, icon, color, type || 'text', req.params.id);
      
      const updatedAgent = db.prepare("SELECT * FROM agents WHERE id = ?").get(req.params.id);
      res.json(updatedAgent);
    } catch (error: any) {
      console.error("Error updating agent:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/agents/:id", (req, res) => {
    try {
      const agentId = req.params.id;
      db.transaction(() => {
        // First delete all messages associated with the chats of this agent
        db.prepare("DELETE FROM messages WHERE chat_id IN (SELECT id FROM chats WHERE agent_id = ?)").run(agentId);
        // Then delete all chats of this agent
        db.prepare("DELETE FROM chats WHERE agent_id = ?").run(agentId);
        // Finally delete the agent
        db.prepare("DELETE FROM agents WHERE id = ?").run(agentId);
      })();
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting agent:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Chat Routes
  app.get("/api/chats", (req, res) => {
    const { agentId, userId } = req.query;
    const chats = db.prepare("SELECT * FROM chats WHERE agent_id = ? AND user_id = ? ORDER BY created_at DESC").all(agentId, userId);
    res.json(chats);
  });

  app.post("/api/chats", (req, res) => {
    try {
      const { agentId, userId, title } = req.body;
      const info = db.prepare("INSERT INTO chats (agent_id, user_id, title) VALUES (?, ?, ?)").run(agentId, userId, title || "Nova Conversa");
      const newChat = db.prepare("SELECT * FROM chats WHERE id = ?").get(info.lastInsertRowid);
      res.json(newChat);
    } catch (error: any) {
      console.error("Error creating chat:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/chats/:id", (req, res) => {
    try {
      const { title } = req.body;
      db.prepare("UPDATE chats SET title = ? WHERE id = ?").run(title, req.params.id);
      res.status(200).send();
    } catch (error: any) {
      console.error("Error updating chat:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/chats/:id", (req, res) => {
    try {
      const chatId = req.params.id;
      db.transaction(() => {
        // Manually delete all messages associated with the chat
        db.prepare("DELETE FROM messages WHERE chat_id = ?").run(chatId);
        // Delete the chat itself
        db.prepare("DELETE FROM chats WHERE id = ?").run(chatId);
      })();
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting chat:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/messages", (req, res) => {
    const { chatId } = req.query;
    const messages = db.prepare("SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC").all(chatId);
    res.json(messages);
  });

  app.post("/api/messages", (req, res) => {
    const { chatId, role, content, image } = req.body;
    db.prepare("INSERT INTO messages (chat_id, role, content, image) VALUES (?, ?, ?, ?)").run(chatId, role, content, image);
    res.status(201).send();
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
