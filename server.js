import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

app.use(
  cors({
    origin: ["https://classepro.github.io", "http://localhost:3000"],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// 🔑 Clés d’environnement
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const GROQ_API_KEYS = process.env.API_KEYS ? process.env.API_KEYS.split(",") : [];

if (!PAYSTACK_SECRET_KEY) console.error("❌ Clé Paystack manquante !");
if (GROQ_API_KEYS.length === 0) console.error("⚠️ Aucune clé Groq trouvée !");

let currentKeyIndex = 0;
const keyUsage = new Map();

function getCurrentGroqKey() {
  return GROQ_API_KEYS[currentKeyIndex];
}

function rotateGroqKey() {
  currentKeyIndex = (currentKeyIndex + 1) % GROQ_API_KEYS.length;
  console.log(`🔄 Clé Groq suivante → ${currentKeyIndex + 1}/${GROQ_API_KEYS.length}`);
}

// ✅ Route test
app.get("/", (req, res) => {
  res.send("✅ Backend Paystack + Groq opérationnel avec rotation sécurisée !");
});

// 🔐 ROUTE PROXY GROQ (corrigée)
app.post("/api/groq-proxy", async (req, res) => {
  const {
    messages,
    model = "meta-llama/llama-4-scout-17b-16e-instruct",
    temperature = 0.7,
    max_tokens = 2048,
  } = req.body;

  if (!messages) {
    return res.status(400).json({ error: "Messages requis" });
  }

  const maxAttempts = GROQ_API_KEYS.length;
  let attempts = 0;

  while (attempts < maxAttempts) {
    const apiKey = getCurrentGroqKey();
    console.log(`🔑 Tentative avec clé ${currentKeyIndex + 1}/${GROQ_API_KEYS.length}`);

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "User-Agent": "ClassePro-IA/1.0",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: Number(temperature),
          max_tokens: Number(max_tokens),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const usageCount = keyUsage.get(currentKeyIndex) || 0;
        keyUsage.set(currentKeyIndex, usageCount + 1);
        console.log(`✅ Réponse Groq OK avec clé ${currentKeyIndex + 1}`);
        return res.json(data);
      } else {
        const errorText = await response.text();
        console.warn(`⚠️ Erreur clé ${currentKeyIndex + 1}: ${response.status} ${errorText}`);
        rotateGroqKey();
        attempts++;
      }
    } catch (err) {
      console.warn(`⚠️ Échec clé ${currentKeyIndex + 1}: ${err.message}`);
      rotateGroqKey();
      attempts++;
    }
  }

  res.status(500).json({
    error: "Toutes les clés Groq ont échoué. Service IA temporairement indisponible.",
  });
});

// 💳 PAYSTACK (inchangé)
app.post("/create-payment", async (req, res) => {
  const { email, amount, sourcePage } = req.body;

  try {
    const callbackUrl = `https://classepro.github.io/Classepro/${sourcePage}.html?paid=true`;

    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PAYSTACK_SECRET_KEY}`,
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
      headers: { "Authorization": `Bearer ${PAYSTACK_SECRET_KEY}` },
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("❌ Erreur verify-payment:", err);
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
});

// 🚀 Lancer le serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur lancé sur le port ${PORT}`);
  console.log(`🔐 ${GROQ_API_KEYS.length} clés Groq prêtes à l’emploi`);
});
