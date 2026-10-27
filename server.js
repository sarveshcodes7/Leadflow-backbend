
require("dotenv").config();

const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON requests from Meta
app.use(express.json());

// Basic health check
app.get("/", (req, res) => {
  res.json({
    app: "LeadFlow Backend",
    status: "running",
    webhook: "/webhook"
  });
});

// Meta webhook verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    token &&
    token === process.env.WEBHOOK_VERIFY_TOKEN
  ) {
    console.log("WhatsApp webhook verified.");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// Receive WhatsApp webhook events
app.post("/webhook", (req, res) => {
  // Acknowledge quickly so Meta does not keep retrying.
  res.sendStatus(200);

  const body = req.body;

  if (body.object !== "whatsapp_business_account") {
    console.log("Received a non-WhatsApp event.");
    return;
  }

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};

      for (const message of value.messages || []) {
        console.log("Incoming WhatsApp message:", {
          from: message.from,
          type: message.type,
          timestamp: message.timestamp
        });
      }

      for (const status of value.statuses || []) {
        console.log("WhatsApp message status:", {
          id: status.id,
          status: status.status,
          recipient: status.recipient_id
        });
      }
    }
  }
});

app.listen(PORT, () => {
  console.log(`LeadFlow backend running on port ${PORT}`);
});
