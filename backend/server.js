const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: [
        process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
        'https://myllm-puce.vercel.app'
    ]
}));

app.use(express.text());

app.post('/api/llm', async (req, res) => {
    try {
        const prompt = req.body?.trim();

        if (!prompt) {
            return res.status(400).send('Prompt is required');
        }

        const response = await fetch(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
                    messages: [
                        {
                            role: 'user',
                            content: prompt
                        }
                    ]
                })
            }
        );

        if (!response.ok) {
            return res.status(response.status).send('LLM request failed');
        }

        const data = await response.json();

        res.send(
            data.choices[0].message.content
        );

    } catch (error) {
        console.error(error);
        res.status(500).send('Internal server error');
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
