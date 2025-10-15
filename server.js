import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(express.json());

// ✅ Activer CORS pour ton frontend GitHub Pages
app.use(cors({
  origin: ["https://classepro.github.io"],
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// 🔑 Clé secrète Paystack (mode test)
const PAYSTACK_SECRET_KEY = "sk_live_23ce07cabc00a8911584d968d910b8496b0eeddd";

// ✅ Route test
app.get("/", (req, res) => {
  res.send("✅ Backend Paystack opérationnel !");
});

// 1. Initialiser un paiement avec callback_url dynamique
app.post("/create-payment", async (req, res) => {
  const { email, amount, sourcePage } = req.body;

  try {
    // Construire l'URL de callback dynamique
    const callbackUrl = `https://classepro.github.io/Classepro/${sourcePage}.html?paid=true`;

    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: amount * 100, // montant en Kobo
        currency: "XOF",
        callback_url: callbackUrl, // URL de redirection dynamique
      }),
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("❌ Erreur create-payment:", err);
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
});

// 2. Vérifier un paiement (inchangé)
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

// 3. Webhook Paystack (inchangé)
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
});