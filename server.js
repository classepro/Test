import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// ✅ Autoriser ton frontend GitHub Pages et localhost (dev)
app.use(
  cors({
    origin: ["https://classepro.github.io", "http://localhost:3000"],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// 🔑 Charger les clés Paystack et Groq depuis Render
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const GROQ_API_KEYS = process.env.API_KEYS ? process.env.API_KEYS.split(",") : [];

if (!PAYSTACK_SECRET_KEY) {
  console.error("❌ Erreur : clé Paystack manquante !");
}

if (GROQ_API_KEYS.length === 0) {
  console.error("⚠️ Aucune clé Groq trouvée !");
}

let currentKeyIndex = 0;
const keyUsage = new Map();

// 🧠 Fonction pour obtenir la clé active
function getCurrentGroqKey() {
  return GROQ_API_KEYS[currentKeyIndex];
}

// 🔄 Basculement automatique vers la clé suivante
function rotateGroqKey() {
  currentKeyIndex = (currentKeyIndex + 1) % GROQ_API_KEYS.length;
  console.log(`🔄 Changement de clé Groq → ${currentKeyIndex + 1}/${GROQ_API_KEYS.length}`);
}

// ✅ Route test
app.get("/", (req, res) => {
  res.send("✅ Backend Paystack + Groq opérationnel avec rotation sécurisée !");
});

// 🔐 ROUTE : obtenir une clé Groq (debug)
app.get("/api/groq-key", (req, res) => {
  try {
    const apiKey = getCurrentGroqKey();
    const usageCount = keyUsage.get(currentKeyIndex) || 0;
    keyUsage.set(currentKeyIndex, usageCount + 1);

    res.json({
      apiKey,
      keyIndex: currentKeyIndex + 1,
      totalKeys: GROQ_API_KEYS.length,
      usage: usageCount + 1,
    });

    rotateGroqKey();
  } catch (error) {
    console.error("❌ Erreur groq-key:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// 🔐 ROUTE : proxy Groq (avec basculement si clé échoue)
app.post("/api/groq-proxy", async (req, res) => {
  const { messages, model = "meta-llama/llama-4-scout-17b-16e-instruct", temperature = 0.7, max_tokens = 4096 } = req.body;

  if (!messages) {
    return res.status(400).json({ error: "Messages requis" });
  }

  let attempts = 0;
  const maxAttempts = GROQ_API_KEYS.length;

  while (attempts < maxAttempts) {
    const apiKey = getCurrentGroqKey();

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const usageCount = keyUsage.get(currentKeyIndex) || 0;
        keyUsage.set(currentKeyIndex, usageCount + 1);
        return res.json(data);
      } else {
        const errorText = await response.text();
        console.warn(`⚠️ Erreur clé ${currentKeyIndex + 1} : ${response.status} ${errorText}`);
        rotateGroqKey();
        attempts++;
      }
    } catch (err) {
      console.warn(`⚠️ Échec clé ${currentKeyIndex + 1}, tentative suivante...`, err.message);
      rotateGroqKey();
      attempts++;
    }
  }

  res.status(500).json({
    error: "Toutes les clés Groq ont échoué. Le service IA est temporairement indisponible.",
  });
});

// 🔐 ROUTE : statut des clés (monitoring)
app.get("/api/keys-status", (req, res) => {
  const status = GROQ_API_KEYS.map((key, index) => ({
    keyIndex: index + 1,
    usage: keyUsage.get(index) || 0,
    isCurrent: index === currentKeyIndex,
    lastChars: key.slice(-6),
  }));

  res.json({
    totalKeys: GROQ_API_KEYS.length,
    currentKeyIndex: currentKeyIndex + 1,
    keyStatus: status,
  });
});

// 💳 ROUTES PAYSTACK (inchangées)
app.post("/create-payment", async (req, res) => {
  const { email, amount, sourcePage } = req.body;

  try {
    const callbackUrl = `https://classepro.github.io/Classepro/${sourcePage}.html?paid=true`;

    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: amount * 100,
        currency: "XOF",
        callback_url: callbackUrl,
      }),
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("❌ Erreur create-payment:", err);
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
});

app.get("/verify-payment/:reference", async (req, res) => {
  const { reference } = req.params;

  try {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      },
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("❌ Erreur verify-payment:", err);
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
});

app.post("/webhook/paystack", (req, res) => {
  const event = req.body;
  console.log("📩 Webhook reçu :", event);

  if (event.event === "charge.success") {
    console.log("✅ Paiement confirmé :", event.data);
  }

  res.sendStatus(200);
});

// 🚀 Lancer serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur lancé sur le port ${PORT}`);
  console.log(`🔐 ${GROQ_API_KEYS.length} clés Groq prêtes à l’emploi`);
});
