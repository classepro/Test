import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ✅ Ta clé secrète (mode test uniquement)
const PAYSTACK_SECRET_KEY = "sk_test_8f5a4fa740888516c795556099ff1dc0042e27b8";

// Route test
app.get("/", (req, res) => {
  res.send("✅ Backend Paystack opérationnel !");
});

// 1. Initialiser un paiement
app.post("/create-payment", async (req, res) => {
  const { email, amount } = req.body;

  try {
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
      }),
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("❌ Erreur create-payment:", err);
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
});

// 2. Vérifier un paiement
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

// 3. Webhook Paystack
app.post("/webhook/paystack", (req, res) => {
  const event = req.body;
  console.log("📩 Webhook reçu :", event);

  if (event.event === "charge.success") {
    console.log("✅ Paiement confirmé :", event.data);
    // Ici tu pourrais mettre à jour une base de données
  }

  res.sendStatus(200); // Paystack attend toujours un 200
});

// Lancer serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur lancé sur le port ${PORT}`);
});