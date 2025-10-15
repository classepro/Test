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

// 🔑 Clés d'environnement
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const GROQ_API_KEYS = process.env.API_KEYS ? process.env.API_KEYS.split(",").map(key => key.trim()) : [];

// 🎯 DIAGNOSTIC: Vérification au démarrage
console.log("🚀 Initialisation du backend ClassePro...");
console.log(`🔑 Nombre de clés Groq chargées: ${GROQ_API_KEYS.length}`);
console.log(`🔐 Paystack configuré: ${!!PAYSTACK_SECRET_KEY}`);

if (!PAYSTACK_SECRET_KEY) console.error("❌ Clé Paystack manquante !");
if (GROQ_API_KEYS.length === 0) console.error("⚠️ Aucune clé Groq trouvée !");

let currentKeyIndex = 0;
const keyUsage = new Map();

function getCurrentGroqKey() {
  return GROQ_API_KEYS[currentKeyIndex];
}

function rotateGroqKey() {
  currentKeyIndex = (currentKeyIndex + 1) % GROQ_API_KEYS.length;
  console.log(`🔄 Rotation clé Groq → ${currentKeyIndex + 1}/${GROQ_API_KEYS.length}`);
}

// ✅ Route test
app.get("/", (req, res) => {
  res.json({ 
    status: "✅ Backend opérationnel",
    groq_keys: GROQ_API_KEYS.length,
    paystack: !!PAYSTACK_SECRET_KEY
  });
});

// 🔐 ROUTE PROXY GROQ UNIFIÉE (version simplifiée)
app.post("/api/groq-proxy", async (req, res) => {
  const {
    messages,
    model = "meta-llama/llama-4-scout-17b-16e-instruct",
    temperature = 0.7,
    max_tokens = 4096,
  } = req.body;

  // 🎯 Validation des données
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ 
      error: "Paramètre 'messages' requis et doit être un tableau",
      received: typeof messages
    });
  }

  console.log(`📥 Requête proxy reçue: ${messages.length} messages, modèle: ${model}`);

  const maxAttempts = GROQ_API_KEYS.length || 1;
  let attempts = 0;
  let lastError = null;

  while (attempts < maxAttempts) {
    const apiKey = getCurrentGroqKey();
    
    if (!apiKey) {
      console.error("❌ Aucune clé API disponible");
      return res.status(503).json({ error: "Aucune clé API configurée" });
    }

    console.log(`🔑 Tentative ${attempts + 1}/${maxAttempts} avec clé ${currentKeyIndex + 1}`);

    try {
      const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: Number(temperature),
          max_tokens: Number(max_tokens),
        }),
      });

      const responseText = await groqResponse.text();
      
      if (groqResponse.ok) {
        const data = JSON.parse(responseText);
        const usageCount = keyUsage.get(currentKeyIndex) || 0;
        keyUsage.set(currentKeyIndex, usageCount + 1);
        
        console.log(`✅ Réponse Groq OK avec clé ${currentKeyIndex + 1}`);
        console.log(`📊 Usage: ${data.usage?.total_tokens || 'N/A'} tokens`);
        
        return res.json(data);
      } else {
        // 🔍 Analyse détaillée des erreurs
        let errorData;
        try {
          errorData = JSON.parse(responseText);
        } catch {
          errorData = { error: responseText };
        }
        
        console.warn(`❌ Erreur HTTP ${groqResponse.status} avec clé ${currentKeyIndex + 1}:`, 
          errorData.error?.message || errorData.error || 'Erreur inconnue');
        
        lastError = {
          status: groqResponse.status,
          message: errorData.error?.message || errorData.error || 'Erreur Groq',
          keyIndex: currentKeyIndex + 1
        };

        // Rotation en cas d'erreur d'authentification ou de quota
        if (groqResponse.status === 401 || groqResponse.status === 429) {
          console.log(`🔄 Rotation après erreur ${groqResponse.status}`);
          rotateGroqKey();
        }
        
        attempts++;
      }
    } catch (err) {
      console.error(`💥 Erreur réseau avec clé ${currentKeyIndex + 1}:`, err.message);
      lastError = {
        status: 500,
        message: err.message,
        keyIndex: currentKeyIndex + 1
      };
      rotateGroqKey();
      attempts++;
    }
  }

  // 🚨 Toutes les tentatives ont échoué
  console.error(`💥 TOUTES LES CLÉS ONT ÉCHOUÉ après ${attempts} tentatives`);
  
  res.status(lastError?.status || 500).json({
    error: "Service IA temporairement indisponible",
    details: lastError?.message || "Toutes les clés ont échoué",
    attempts: attempts
  });
});

// 🧪 ROUTE DE TEST DE CONNECTIVITÉ
app.get("/api/health", async (req, res) => {
  try {
    const apiKey = getCurrentGroqKey();
    if (!apiKey) {
      return res.status(503).json({ 
        status: "error", 
        message: "Aucune clé API configurée" 
      });
    }

    const testResponse = await fetch("https://api.groq.com/openai/v1/models", {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      timeout: 10000
    });

    if (testResponse.ok) {
      const models = await testResponse.json();
      res.json({
        status: "success",
        message: `✅ Backend et Groq opérationnels (clé ${currentKeyIndex + 1}/${GROQ_API_KEYS.length})`,
        groq_models: models.data ? models.data.length : 0,
        available_keys: GROQ_API_KEYS.length
      });
    } else {
      res.status(testResponse.status).json({
        status: "error",
        message: `❌ Erreur Groq: ${testResponse.status}`,
        key_index: currentKeyIndex + 1
      });
    }
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: `💥 Erreur de connexion: ${error.message}`
    });
  }
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
  console.log(`🔐 ${GROQ_API_KEYS.length} clés Groq prêtes à l'emploi`);
  console.log(`🌍 Health check: http://localhost:${PORT}/api/health`);
});        "Content-Type": "application/json",
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
