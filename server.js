
require("dotenv").config();

const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "20kb" }));

// Health check
app.get("/", (req, res) => {
  res.json({
    app: "LeadFlow Backend",
    status: "running",
    webhook: "/webhook",
    sendEndpoint: "/api/send-template"
  });
});

// Meta webhook verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    process.env.WEBHOOK_VERIFY_TOKEN &&
    token === process.env.WEBHOOK_VERIFY_TOKEN
  ) {
    console.log("WhatsApp webhook verified.");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// Receive incoming WhatsApp webhook events
app.post("/webhook", (req, res) => {
  // Acknowledge promptly
  res.sendStatus(200);

  const body = req.body;

  if (body?.object !== "whatsapp_business_account") {
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

// Send an approved WhatsApp template
app.post("/api/send-template", async (req, res) => {
  try {
    const { phone, name } = req.body || {};

    // Phone number must include country code, without + or spaces.
    if (typeof phone !== "string" ||
        !/^[1-9]\d{7,14}$/.test(phone)) {
      return res.status(400).json({
        error: "Enter a valid phone number with country code, without +."
      });
    }

    const {
      WHATSAPP_ACCESS_TOKEN,
      WHATSAPP_PHONE_NUMBER_ID,
      WHATSAPP_TEMPLATE_NAME,
      WHATSAPP_TEMPLATE_LANGUAGE,
      GRAPH_API_VERSION
    } = process.env;

    if (
      !WHATSAPP_ACCESS_TOKEN ||
      !WHATSAPP_PHONE_NUMBER_ID ||
      !WHATSAPP_TEMPLATE_NAME ||
      !WHATSAPP_TEMPLATE_LANGUAGE ||
      !GRAPH_API_VERSION
    ) {
      return res.status(500).json({
        error: "WhatsApp configuration is incomplete in Render."
      });
    }

    const recipientName =
      typeof name === "string" && name.trim()
        ? name.trim().slice(0, 100)
        : "there";

    const apiUrl =
      `https://graph.facebook.com/${GRAPH_API_VERSION}/` +
      `${WHATSAPP_PHONE_NUMBER_ID}/messages`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "template",
        template: {
          name: WHATSAPP_TEMPLATE_NAME,
          language: {
            code: WHATSAPP_TEMPLATE_LANGUAGE
          },
          components: [
            {
              type: "body",
              parameters: [
                {
                  type: "text",
                  text: recipientName
                }
              ]
            }
          ]
        }
      }),
      signal: AbortSignal.timeout(15000)
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("WhatsApp API rejected the request:", {
        status: response.status,
        error: result.error?.message,
        code: result.error?.code
      });

      return res.status(502).json({
        error: "Meta rejected the message request.",
        metaError: result.error?.message || "Unknown Meta API error",
        metaCode: result.error?.code || null
      });
    }

    return res.status(200).json({
      success: true,
      message: "Meta accepted the message request.",
      messageId: result.messages?.[0]?.id || null
    });
  } catch (error) {
    console.error("WhatsApp request failed:", error.message);

    return res.status(500).json({
      error: "The message request could not be completed."
    });
  }
});

app.listen(PORT, () => {
  console.log(`LeadFlow backend running on port ${PORT}`);
});
