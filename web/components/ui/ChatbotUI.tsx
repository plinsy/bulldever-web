"use client";

import { useState } from "react";
import { Send, X, Bot } from "lucide-react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";

const API_BASE = "http://localhost:8000/api";

export default function ChatbotUI({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
    const [messages, setMessages] = useState<{role: string, text: string}[]>([
        { role: 'bot', text: 'Salama! Je suis votre assistant trafic. Comment puis-je vous aider aujourd\'hui?' }
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSend = async () => {
        if (!input.trim()) return;
        const userMsg = input;
        setInput("");
        setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setLoading(true);

        try {
            const res = await axios.post(`${API_BASE}/chatbot/`, { query: userMsg });
            setMessages(prev => [...prev, { role: 'bot', text: res.data.response }]);
        } catch (err) {
            setMessages(prev => [...prev, { role: 'bot', text: "Désolé, je ne parviens pas à me connecter au serveur." }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div 
                    initial={{ x: 400 }}
                    animate={{ x: 0 }}
                    exit={{ x: 400 }}
                    className="fixed right-0 top-0 h-full w-96 bg-slate-900 border-l border-slate-700 shadow-2xl z-50 flex flex-col"
                >
                    <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
                        <div className="flex items-center gap-2 text-white font-bold">
                            <Bot className="text-blue-400" />
                            Assistant Tana
                        </div>
                        <button onClick={onClose} className="text-slate-400 hover:text-white">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {messages.map((m, i) => (
                            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                                    m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-200'
                                }`}>
                                    {m.text}
                                </div>
                            </div>
                        ))}
                        {loading && <div className="text-slate-500 text-xs italic">L'IA réfléchit...</div>}
                    </div>

                    <div className="p-4 bg-slate-800 border-t border-slate-700">
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                placeholder="Posez une question..."
                                className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                            />
                            <button 
                                onClick={handleSend}
                                className="bg-blue-600 p-2 rounded-lg text-white hover:bg-blue-500 transition-colors"
                            >
                                <Send size={20} />
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
