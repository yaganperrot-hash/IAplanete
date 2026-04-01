const express = require('express');
const { chat } = require('ollama'); // Assurez-vous d'avoir fait : npm install ollama
const app = express();

app.use(express.json()); // Pour lire le JSON envoyé par votre interface

// Route pour le RP
app.post('/api/rp', async (req, res) => {
    const { prompt, history } = req.body;

    try {
        // On prépare la mémoire pour Mistral-Nemo
        const messages = [
            { role: 'system', content: 'Tu es un maître de jeu immersif. Réponds en français.' },
            ...history,
            { role: 'user', content: prompt }
        ];

        // Appel à Ollama avec streaming pour l'interface visuelle
        const response = await chat({
            model: 'mistral-nemo',
            messages: messages,
            stream: true,
            options: {
                num_ctx: 16384, // Exploite vos 32 Go de RAM
                temperature: 0.8
            }
        });

        // On envoie la réponse mot à mot au frontend
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        for await (const part of response) {
            res.write(part.message.content);
        }
        res.end();

    } catch (error) {
        console.error("Erreur Ollama:", error);
        res.status(500).send("L'IA locale ne répond pas. Vérifiez qu'Ollama est lancé.");
    }
});

app.listen(3000, () => console.log('Serveur RP lancé sur http://localhost:3000'));