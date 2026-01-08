import { io } from "socket.io-client";
import axios from "axios";
import { SOCKET_EVENTS } from "../src/sockets/socket.types";

// CONFIGURATION
const API_URL = "http://localhost:5001/api";
const SOCKET_URL = "http://localhost:5001";
const USER_EMAIL = "test@example.com"; // Change to a valid user email in your DB
const USER_PASSWORD = "password123";   // Change to valid password

async function verifySocketFlow() {
    console.log("🚀 Starting Socket.IO Verification Flow...");

    try {
        // 1. Authenticate via REST to get Token
        console.log("Step 1: Authenticating...");
        // Note: Adjust the login endpoint payload to match your auth flow
        const authRes = await axios.post(`${API_URL}/auth/login`, {
            email: USER_EMAIL,
            password: USER_PASSWORD,
        });

        const token = authRes.data.token;
        if (!token) throw new Error("Failed to get token");
        console.log("✅ Authenticated. Token received.");

        // 2. Connect to Socket
        console.log("Step 2: Connecting to Socket.IO...");
        const socket = io(SOCKET_URL, {
            auth: { token },
            transports: ["websocket"],
        });

        await new Promise<void>((resolve, reject) => {
            socket.on("connect", () => {
                console.log(`✅ Connected to Socket.IO! ID: ${socket.id}`);
                resolve();
            });
            socket.on("connect_error", (err) => {
                reject(new Error(`Socket connection failed: ${err.message}`));
            });
        });

        // 3. Join a Conversation Room
        // We need a valid conversation ID. For this test, you might need to hardcode one or create one via REST first.
        // Assuming we have one or create a dummy one. 
        // For simplicity, let's assume we create a conversation or pick a known one.
        // Here we'll just try to join a "test-conversation-id" and expect "Not authorized" if strict rules apply
        // OR we should implement a helper to create a conversation first.

        // Let's rely on the user to provide a valid conversation ID where they are a participant
        // OR create a loopback conversation if possible.
        const TEST_CONVERSATION_ID = process.argv[2];

        if (!TEST_CONVERSATION_ID) {
            console.warn("⚠️  No conversation ID passed. usage: npx ts-node scripts/verify-socket.ts <conversationId>");
            console.warn("⚠️  Skipping specific room logic tests without ID.");
        } else {
            console.log(`Step 3: Joining Conversation ${TEST_CONVERSATION_ID}...`);
            socket.emit(SOCKET_EVENTS.CONVERSATION.JOIN, TEST_CONVERSATION_ID);

            // Listen for new message
            console.log("Step 4: Listening for messages...");
            const messagePromise = new Promise((resolve) => {
                socket.on(SOCKET_EVENTS.MESSAGE.NEW, (msg) => {
                    console.log("📩  RECEIVED MESSAGE via Socket:", msg);
                    resolve(msg);
                });
            });

            // 4. Send Message via REST
            console.log("Step 5: Sending Message via REST...");
            const msgPayload = {
                text: `Test message at ${new Date().toISOString()}`,
                clientMessageId: `temp-${Date.now()}`
            };

            await axios.post(`${API_URL}/messages/${TEST_CONVERSATION_ID}`, msgPayload, {
                headers: { Authorization: `Bearer ${token}` }
            });
            console.log("✅ Message sent via REST.");

            // Wait for socket reception
            await messagePromise;
            console.log("✅ Real-time delivery verified!");
        }

        // 5. Verify Presence (Self-check or just emission)
        // socket.on(SOCKET_EVENTS.PRESENCE.ONLINE, ...)

        console.log("🎉 Verification Complete!");
        socket.disconnect();
        process.exit(0);

    } catch (error: any) {
        console.error("❌ Verification Failed:", error.message);
        if (error.response) console.error("API Response:", error.response.data);
        process.exit(1);
    }
}

verifySocketFlow();
