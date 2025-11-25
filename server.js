// 引入需要的工具
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer"); // 引入 multer

const path = require("path");
const fs = require("fs");

const HISTORY_FILE = path.join(__dirname, "chat_history.json");
let chatHistory = [];

// 載入歷史訊息
if (fs.existsSync(HISTORY_FILE)) {
  try {
    const data = fs.readFileSync(HISTORY_FILE, "utf8");
    chatHistory = JSON.parse(data);
  } catch (err) {
    console.error("讀取歷史訊息失敗:", err);
  }
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 🌍 設定讓瀏覽器可以讀取目前的網頁檔案
app.use(express.static(path.join(__dirname, "public")));

// 📁 設定 Multer 儲存位置
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, "public/uploads");
    // 確保目錄存在 (如果不存在要建立，這裡簡單假設已存在或手動建立，
    // 但為了保險，可以用 fs.mkdirSync(uploadDir, { recursive: true }))
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // 檔名：時間戳記 + 原始副檔名
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

// 📤 上傳 API
app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded.");
  }
  // 回傳檔案的 URL (相對於 public)
  res.send(`/uploads/${req.file.filename}`);
});

// 🔐 這裡設定「帳號密碼」 (寫死在這裡，最簡單)
const USERS = {
  admin: "password123", // 預設密碼
  friend: "password123",
  guest: "password123",
};

// 輔助函式：儲存並廣播系統訊息
function saveAndBroadcastSystemMsg(text) {
  const msgData = {
    user: "System",
    text: text,
    type: "system", // 標記為系統訊息
    time: new Date().toLocaleTimeString("zh-TW", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    timestamp: new Date().toISOString(),
    id: Date.now() + Math.random().toString(36).substr(2, 9), // 唯一 ID
    readBy: [], // 已讀清單
  };

  chatHistory.push(msgData);
  fs.writeFile(HISTORY_FILE, JSON.stringify(chatHistory, null, 2), (err) => {
    if (err) console.error("寫入歷史訊息失敗:", err);
  });

  io.emit("receive_msg", msgData);
}
// 追蹤線上使用者 (socket.id -> username)
const onlineUsers = new Map();

// 廣播線上使用者名單
function broadcastOnlineUsers() {
  // 回傳 [{ id: socket.id, name: username }, ...]
  const users = [];
  onlineUsers.forEach((username, id) => {
    users.push({ id, name: username });
  });
  io.emit("online_users_update", users);
}

// 當有人連上來時...
io.on("connection", (socket) => {
  console.log("有一個人連線了！ID:", socket.id);
  let currentUser = null;

  // Debug: 監聽所有事件
  socket.onAny((eventName, ...args) => {
    console.log(`[Socket Event] ${eventName}`, args);
  });

  // 1. 處理登入請求
  socket.on("try_login", (data) => {
    console.log(
      `[Login Attempt] User: ${data.username}, Password: ${data.password}, Socket: ${socket.id}`
    );
    const { username, password } = data;

    // 檢查帳號密碼對不對
    if (USERS[username] && USERS[username] === password) {
      console.log(`[Login Success] User: ${username}`);
      currentUser = username;
      // 紀錄已登入的使用者
      onlineUsers.set(socket.id, username);

      // 告訴前端：登入成功！
      socket.emit("login_result", {
        success: true,
        username: username,
        history: chatHistory, // 傳送歷史訊息
      });
      // 廣播給所有人：有人上線了
      saveAndBroadcastSystemMsg(`${username} 上線囉！`);
      broadcastOnlineUsers(); // 廣播更新名單
    } else {
      console.log(`[Login Failed] User: ${username} - Invalid credentials`);
      // 告訴前端：登入失敗
      socket.emit("login_result", { success: false, msg: "帳號或密碼錯誤 🚫" });
    }
  });

  // --- WebRTC 視訊通話信令 (Signaling) ---

  // A 呼叫 B
  socket.on("call-user", (data) => {
    // data: { userToCall: socketId, signalData: offerData, from: myName }
    io.to(data.userToCall).emit("call-made", {
      offer: data.signalData,
      socket: socket.id,
      name: currentUser,
    });
  });

  // B 接聽 A
  socket.on("make-answer", (data) => {
    // data: { to: socketId, signal: answerData }
    io.to(data.to).emit("answer-made", {
      socket: socket.id,
      answer: data.signal,
    });
  });

  // 交換 ICE 候選人
  socket.on("ice-candidate", (data) => {
    // data: { to: socketId, candidate: candidateData }
    io.to(data.to).emit("ice-candidate", {
      socket: socket.id,
      candidate: data.candidate,
    });
  });

  // 處理掛斷通話
  socket.on("call-ended", (data) => {
    // data: { to: socketId }
    if (data.to) {
      io.to(data.to).emit("call-ended");
    }
  });

  // 2. 處理傳送訊息
  socket.on("send_msg", (msg) => {
    if (!currentUser) {
      socket.emit("force_logout"); // 通知前端強制登出
      return;
    }

    const msgData = {
      user: currentUser,
      text: msg.text,
      type: msg.type || "text", // 分辨是文字還是貼圖
      time: new Date().toLocaleTimeString("zh-TW", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      timestamp: new Date().toISOString(), // 儲存完整時間以便排序或顯示日期
      id: Date.now() + Math.random().toString(36).substr(2, 9), // 唯一 ID
      readBy: [], // 已讀清單
    };

    // 存入歷史紀錄
    chatHistory.push(msgData);
    // 寫入檔案 (簡單實作：每次都寫入整個陣列)
    fs.writeFile(HISTORY_FILE, JSON.stringify(chatHistory, null, 2), (err) => {
      if (err) console.error("寫入歷史訊息失敗:", err);
    });

    // 廣播給所有人
    io.emit("receive_msg", msgData);

    // Web Push Notification (背景推播)
    subscriptions.forEach((sub, subUser) => {
      if (subUser !== currentUser) {
        const payload = JSON.stringify({
          title: `來自 ${currentUser} 的訊息`,
          body: msg.type === "text" ? msg.text : `傳送了一個${msg.type}`,
          url: "http://localhost:3000", // 點擊通知打開的網址
        });
        webpush
          .sendNotification(sub, payload)
          .catch((err) => console.error("Push Error:", err));
      }
    });
  });

  // 2.5 處理已讀
  socket.on("mark_read", (data) => {
    const { messageId, user } = data;
    const msg = chatHistory.find((m) => m.id === messageId);

    if (msg) {
      if (!msg.readBy) msg.readBy = [];
      if (!msg.readBy.includes(user)) {
        msg.readBy.push(user);
        // 廣播已讀更新
        io.emit("message_read", { messageId, readBy: msg.readBy });
      }
    }
  });

  // 3. 斷線處理
  socket.on("disconnect", () => {
    if (currentUser) {
      console.log(`${currentUser} 離開了...`);
      onlineUsers.delete(socket.id);
      saveAndBroadcastSystemMsg(`${currentUser} 離開了... 👋`);
      broadcastOnlineUsers();
    }
  });
});

const webpush = require("web-push");
const bodyParser = require("body-parser");

// VAPID Keys (用於推播通知)
// 實務上應該放在環境變數 (.env) 中，不要直接寫死在程式碼裡
// 您可以使用指令 `npx web-push generate-vapid-keys` 來產生新的金鑰
const publicVapidKey = "YOUR_PUBLIC_VAPID_KEY_HERE";
const privateVapidKey = "YOUR_PRIVATE_VAPID_KEY_HERE";

webpush.setVapidDetails(
  "mailto:test@test.com",
  publicVapidKey,
  privateVapidKey
);

// Middleware
app.use(bodyParser.json());

// 儲存訂閱資訊 (username -> subscription)
// 在真實專案中應該存資料庫
const subscriptions = new Map();

// 訂閱路由
app.post("/subscribe", (req, res) => {
  const subscription = req.body;
  // 這裡假設前端會傳 username 過來，或者我們用 socket id 對應
  // 為了簡單，我們讓前端在 body 帶 username
  const { username } = req.query;

  if (username) {
    subscriptions.set(username, subscription);
    console.log(`User ${username} subscribed to push notifications.`);
    res.status(201).json({});
  } else {
    res.status(400).json({ error: "Username required" });
  }
});

// 啟動伺服器，監聽 3000 埠口
server.listen(3000, () => {
  console.log("✅ 伺服器啟動成功！");
  console.log("👉 請在瀏覽器輸入 http://localhost:3000 來測試");
});
