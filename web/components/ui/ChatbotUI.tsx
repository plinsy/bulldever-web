"use client";

import { useState, useRef, useEffect } from "react";
import { Send, X, Bot, User } from "lucide-react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { LatLng } from "../world/geo";

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const API_BASE = "http://127.0.0.1:8000/api";

export default function ChatbotUI({ isOpen, onClose, center }: { isOpen: boolean, onClose: () => void, center: LatLng }) {
    const [messages, setMessages] = useState<{role: string, text: string}[]>([
        { role: 'bot', text: 'Salama! Je suis votre assistant trafic. Comment puis-je vous aider aujourd\'hui?' }
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim()) return;
        const userMsg = input;
        setInput("");
        setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setLoading(true);

        try {
            const res = await axios.post(`${API_BASE}/chatbot/`, { 
                query: userMsg,
                user_location: center
            });
            setMessages(prev => [...prev, { role: 'bot', text: res.data.response }]);

            // Handle actions from the chatbot
            if (res.data.actions && res.data.actions.length > 0) {
                res.data.actions.forEach((action: any) => {
                    window.dispatchEvent(new CustomEvent('MAP_ACTION', { detail: action }));
                });
            }
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
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    className="fixed right-0 top-0 h-full w-full sm:w-96 bg-base-300 border-l border-white/10 shadow-2xl z-[70] flex flex-col"
                >
                    {/* Header */}
                    <div className="p-4 border-b border-white/10 flex justify-between items-center bg-base-200">
                        <div className="flex items-center gap-3">
                            <div className="avatar placeholder">
                                <div className="bg-primary/20 text-primary rounded-xl w-10 h-10 flex items-center justify-center">
                                    <Bot size={22} />
                                </div>
                            </div>
                            <div>
                                <h2 className="text-white font-bold text-sm leading-tight">Assistant Tana</h2>
                                <div className="flex items-center gap-1.5 leading-none mt-0.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">En ligne</span>
                                </div>
                            </div>
                        </div>
                        <button onClick={onClose} className="btn btn-ghost btn-sm btn-circle">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Chat area */}
                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                        {messages.map((m, i) => (
                            <div key={i} className={`chat ${m.role === 'user' ? 'chat-end' : 'chat-start'}`}>
                                <div className="chat-image avatar">
                                    <div className="w-8 rounded-full bg-base-100 p-1.5 border border-white/5">
                                        {m.role === 'user' ? <User size={16} /> : <Bot size={16} className="text-primary" />}
                                    </div>
                                </div>
                                <div className={`chat-bubble text-sm prose prose-sm max-w-full prose-p:my-0 prose-headings:mb-2 prose-headings:mt-4 prose-ul:my-2 prose-li:my-0 ${
                                    m.role === 'user' ? 'chat-bubble-primary prose-invert' : 'bg-base-100 text-slate-200 prose-invert'
                                }`}>
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {m.text}
                                    </ReactMarkdown>
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="chat chat-start">
                                <div className="chat-bubble bg-base-100 text-slate-500 text-xs italic flex gap-2 items-center">
                                    <span className="loading loading-dots loading-xs"></span>
                                    Réflexion en cours...
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Input area */}
                    <div className="p-4 bg-base-200 border-t border-white/10">
                        <div className="join w-full">
                            <input 
                                type="text" 
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                placeholder="Posez une question..."
                                className="input input-bordered join-item flex-1 focus:input-primary bg-base-100 text-sm"
                            />
                            <button 
                                onClick={handleSend}
                                className="btn btn-primary join-item px-4"
                            >
                                <Send size={18} />
                            </button>
                        </div>
                        <p className="text-[10px] text-slate-600 mt-3 text-center uppercase tracking-widest font-bold">
                            AlaminoAI Intelligence v2.1
                        </p>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
