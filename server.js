import express from "express";
import cors from "cors";

const app = express();

app.use(cors({
  origin: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 10000;
const MOLLIE_API = "https://api.mollie.com/v2/payments";

// Test du serveur
app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "Mastery AI Payment Backend"
  });
});

// Création d'un paiement Mollie
app.post("/api/create-payment", async (req, res) => {
  const apiKey = process.env.MOLLIE_API_KEY;
  const siteUrl = process.env.SITE_URL;
  const backendUrl = process.env.BACKEND_URL;

  if (!apiKey) {
    return res.status(500).json({
      error: "MOLLIE_API_KEY is missing"
    });
  }

  if (!siteUrl) {
    return res.status(500).json({
      error: "SITE_URL is missing"
    });
  }

  if (!backendUrl) {
    return res.status(500).json({
      error: "BACKEND_URL is missing"
    });
  }

  try {
    const response = await fetch(MOLLIE_API, {
      method: "POST",

      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        amount: {
          currency: "EUR",
          value: "10.00"
        },

        description: "Mastery AI — Formation complète",

        redirectUrl: `${siteUrl}?payment=success`,

        webhookUrl: `${backendUrl}/api/webhook`,

        metadata: {
          product: "mastery-ai",
          price: "10.00"
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Mollie error:", data);

      return res.status(response.status).json({
        error: data.detail || "Mollie payment creation failed"
      });
    }

    const checkoutUrl = data._links?.checkout?.href;

    if (!checkoutUrl) {
      return res.status(500).json({
        error: "Mollie did not return a checkout URL"
      });
    }

    return res.json({
      success: true,
      checkoutUrl: checkoutUrl,
      paymentId: data.id
    });

  } catch (error) {
    console.error("Payment creation error:", error);

    return res.status(500).json({
      error: "Unable to create payment"
    });
  }
});

// Webhook Mollie
app.post("/api/webhook", async (req, res) => {
  const paymentId = req.body?.id;

  if (!paymentId) {
    return res.status(400).send("Missing payment ID");
  }

  const apiKey = process.env.MOLLIE_API_KEY;

  if (!apiKey) {
    return res.status(500).send("MOLLIE_API_KEY is missing");
  }

  try {
    const response = await fetch(
      `${MOLLIE_API}/${encodeURIComponent(paymentId)}`,
      {
        method: "GET",

        headers: {
          "Authorization": `Bearer ${apiKey}`
        }
      }
    );

    const payment = await response.json();

    if (!response.ok) {
      console.error("Mollie verification error:", payment);

      return res.status(response.status).send(
        "Mollie verification failed"
      );
    }

    console.log("Payment update:", {
      id: payment.id,
      status: payment.status,
      amount: payment.amount,
      metadata: payment.metadata
    });

    if (payment.status === "paid") {
      console.log(
        `PAYMENT PAID: ${payment.id}`
      );

      // Le déblocage des 24 modules sera connecté ici.
    }

    return res.status(200).send("OK");

  } catch (error) {
    console.error("Webhook error:", error);

    return res.status(500).send("Webhook error");
  }
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(
    `Mastery AI backend running on port ${PORT}`
  );
});
