import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  MessageSquare, 
  Trash2, 
  Brain, 
  Send, 
  Loader2, 
  ChevronRight,
  ArrowLeft,
  Bot,
  Sparkles,
  User,
  Terminal,
  Code,
  Pen,
  Search,
  Zap,
  Shield,
  Music,
  Camera,
  Globe,
  Edit2,
  X,
  Save,
  Download,
  Palette,
  Rocket,
  Heart,
  Star,
  Coffee,
  Book,
  Mic,
  Video
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Agent, generateAgentDefinition, chatWithAgent, generateChatTitle } from './services/geminiService';

const ICON_MAP: Record<string, any> = {
  Brain, Bot, Sparkles, Terminal, Code, Pen, Search, Zap, Shield, Music, Camera, Globe, MessageSquare,
  Palette, Rocket, Heart, Star, Coffee, Book, Mic, Video
};

const SESSION_KEY = 'ai_forge_session';
const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 dias em ms

const IconRenderer = ({ name, size = 20, className = "" }: { name: string, size?: number, className?: string }) => {
  const IconComponent = ICON_MAP[name] || Bot;
  return <IconComponent size={size} className={className} />;
};

export default function App() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [creationPrompt, setCreationPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string, image?: string }[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [chats, setChats] = useState<{ id: number, title: string }[]>([]);
  const [currentChatId, setCurrentChatId] = useState<number | null>(null);
  const [showChatList, setShowChatList] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Auth state
  const [user, setUser] = useState<{ id: number, email: string } | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Edit state
  const [editForm, setEditForm] = useState<Agent | null>(null);

  useEffect(() => {
    // Check for existing session
    const storedSession = localStorage.getItem(SESSION_KEY);
    if (storedSession) {
      try {
        const { user: savedUser, timestamp } = JSON.parse(storedSession);
        const now = Date.now();
        if (now - timestamp < SESSION_DURATION) {
          setUser(savedUser);
        } else {
          localStorage.removeItem(SESSION_KEY);
        }
      } catch (e) {
        localStorage.removeItem(SESSION_KEY);
      }
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchAgents(user.id);
    } else {
      setAgents([]);
      setSelectedAgent(null);
    }

    const handleOAuthMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        const userData = event.data.user;
        setUser(userData);
        localStorage.setItem(SESSION_KEY, JSON.stringify({
          user: userData,
          timestamp: Date.now()
        }));
        setShowLoginModal(false);
        setIsCreating(true);
      }
    };
    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [user]);

  const fetchAgents = async (userId: number) => {
    const res = await fetch(`/api/agents?userId=${userId}`);
    const data = await res.json();
    setAgents(data);
  };

  const fetchChats = async (agentId: number, userId: number) => {
    const res = await fetch(`/api/chats?agentId=${agentId}&userId=${userId}`);
    const data = await res.json();
    setChats(data);
    if (data.length > 0) {
      handleSelectChat(data[0].id);
    } else {
      // Just clear for a new chat, don't create on server yet
      setCurrentChatId(null);
      setMessages([]);
    }
  };

  const handleSelectChat = async (chatId: number) => {
    setCurrentChatId(chatId);
    const res = await fetch(`/api/messages?chatId=${chatId}`);
    const data = await res.json();
    setMessages(data);
  };

  const handleNewChat = async (agentId: number, userId: number) => {
    // Just clear local state, don't hit the server
    setCurrentChatId(null);
    setMessages([]);
  };

  const handleDeleteChat = async (e: React.MouseEvent, chatId: number) => {
    e.stopPropagation();
    if (!window.confirm('Excluir esta conversa?')) return;

    try {
      const res = await fetch(`/api/chats/${chatId}`, { method: 'DELETE' });
      if (res.ok) {
        setChats(prev => prev.filter(c => c.id !== chatId));
        if (currentChatId === chatId) {
          setCurrentChatId(null);
          setMessages([]);
        }
      }
    } catch (error) {
      console.error("Erro ao excluir conversa:", error);
    }
  };

  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creationPrompt.trim() || !user) return;

    setIsGenerating(true);
    try {
      const agentDef = await generateAgentDefinition(creationPrompt);
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...agentDef, userId: user.id }),
      });
      const newAgent = await res.json();
      setAgents([newAgent, ...agents]);
      setCreationPrompt('');
      setIsCreating(false);
      setSelectedAgent(newAgent);
      setMessages([]);
    } catch (error) {
      console.error("Erro ao criar agente:", error);
      alert("Houve um erro ao forjar seu especialista. Por favor, tente novamente.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUpdateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm || !editForm.id) return;

    try {
      const res = await fetch(`/api/agents/${editForm.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const updatedAgent = await res.json();
      setAgents(agents.map(a => a.id === updatedAgent.id ? updatedAgent : a));
      setSelectedAgent(updatedAgent);
      setIsEditing(false);
      setEditForm(null);
    } catch (error) {
      console.error("Erro ao atualizar agente:", error);
    }
  };

  const handleDeleteAgent = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    
    // Save current state for possible rollback if server call fails
    const previousAgents = [...agents];
    const previousSelectedAgent = selectedAgent;
    const previousMessages = [...messages];

    // Optimistically remove from UI
    setAgents(agents.filter(a => String(a.id) !== String(id)));
    if (selectedAgent && String(selectedAgent.id) === String(id)) {
      setSelectedAgent(null);
      setMessages([]);
    }

    try {
      const res = await fetch(`/api/agents/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        alert(`Erro ao excluir especialista: ${errData.error || res.statusText}`);
        // Rollback on failure
        setAgents(previousAgents);
        setSelectedAgent(previousSelectedAgent);
        setMessages(previousMessages);
      }
    } catch (error: any) {
      console.error("Erro ao excluir agente:", error);
      alert(`Erro de conexão ao excluir especialista: ${error.message}`);
      // Rollback on failure
      setAgents(previousAgents);
      setSelectedAgent(previousSelectedAgent);
      setMessages(previousMessages);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !selectedAgent || !user) return;

    const userMsg = chatInput;
    setChatInput('');
    const newUserMsg = { role: 'user' as const, content: userMsg };
    setMessages(prev => [...prev, newUserMsg]);
    setIsTyping(true);

    let chatId = currentChatId;

    // Create chat if it doesn't exist yet (first message)
    if (!chatId) {
      const res = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgent.id, userId: user.id, title: 'Nova Conversa' }),
      });
      const newChat = await res.json();
      chatId = newChat.id;
      setCurrentChatId(chatId);
      setChats(prev => [newChat, ...prev]);
    }

    // Save user message
    await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, ...newUserMsg }),
    });

    try {
      const response = await chatWithAgent(selectedAgent, userMsg, messages);
      const assistantMsg = { 
        role: 'assistant' as const, 
        content: response.text || (response.image ? "Aqui está a imagem que você pediu:" : "Não consegui processar isso."),
        image: response.image
      };
      setMessages(prev => [...prev, assistantMsg]);
      
      // Save assistant message
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, ...assistantMsg }),
      });

      // If it's the first exchange, generate a title
      if (messages.length === 0) {
        const newTitle = await generateChatTitle(userMsg, assistantMsg.content);
        await fetch(`/api/chats/${chatId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: newTitle }),
        });
        // Update local chats list
        setChats(prev => prev.map(c => c.id === chatId ? { ...c, title: newTitle } : c));
      }
    } catch (error) {
      console.error("Erro no chat:", error);
    } finally {
      setIsTyping(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const endpoint = isRegistering ? '/api/register' : '/api/login';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        localStorage.setItem(SESSION_KEY, JSON.stringify({
          user: userData,
          timestamp: Date.now()
        }));
        setShowLoginModal(false);
        setIsRegistering(false);
        setIsCreating(true); 
      } else {
        const err = await res.json();
        setLoginError(err.error || (isRegistering ? 'Erro ao criar conta' : 'Erro ao fazer login'));
      }
    } catch (error) {
      setLoginError('Erro de conexão');
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const response = await fetch('/api/auth/google/url');
      const { url } = await response.json();
      window.open(url, 'google_oauth', 'width=600,height=700');
    } catch (error) {
      console.error("Erro ao iniciar login Google:", error);
      setLoginError('Erro ao iniciar login com Google');
    }
  };

  return (
    <div className="flex h-screen bg-[#f8f9fa] overflow-hidden relative">
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-80 bg-white border-r border-slate-200 flex flex-col shadow-xl transition-transform duration-300 md:translate-x-0 md:static md:shadow-sm
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 border-bottom border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                <Zap size={24} fill="currentColor" />
              </div>
              <div>
                <h1 className="font-bold text-lg tracking-tight">AI Forge</h1>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Fábrica de Agentes</p>
              </div>
            </div>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="md:hidden p-2 hover:bg-slate-100 rounded-xl text-slate-500 transition-all active:scale-95 flex items-center justify-center"
              title="Fechar menu"
            >
              <ArrowLeft size={20} />
            </button>
          </div>
          
          <button 
            onClick={() => { 
              if (!user) {
                setShowLoginModal(true);
              } else {
                setIsCreating(true); 
                setIsEditing(false); 
                setSelectedAgent(null); 
              }
            }}
            className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] font-medium shadow-md"
          >
            <Plus size={18} />
            Novo Especialista
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <h2 className="px-2 text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Seus Agentes</h2>
          {agents.map(agent => (
            <div 
              key={agent.id}
              onClick={() => { 
                setSelectedAgent(agent); 
                setIsCreating(false); 
                setIsEditing(false); 
                setMessages([]); 
                setIsSidebarOpen(false);
                if (user) fetchChats(agent.id!, user.id);
              }}
              className={`group relative p-3 rounded-xl cursor-pointer transition-all flex items-center gap-3 ${
                selectedAgent?.id === agent.id 
                ? 'bg-indigo-50 text-indigo-700 shadow-sm border border-indigo-100' 
                : 'hover:bg-slate-50 text-slate-600'
              }`}
            >
              <div 
                className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center shadow-sm"
                style={{ backgroundColor: `${agent.color}20`, color: agent.color }}
              >
                <IconRenderer name={agent.icon} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{agent.name}</p>
                <p className="text-xs opacity-60 truncate">{agent.description}</p>
              </div>
              <div className="flex opacity-0 group-hover:opacity-100 transition-all gap-1">
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setEditForm(agent);
                    setIsEditing(true);
                    setIsCreating(false);
                    setSelectedAgent(null);
                  }}
                  className="p-2 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-all"
                  title="Editar"
                >
                  <Edit2 size={14} />
                </button>
                <button 
                  onClick={(e) => handleDeleteAgent(e, agent.id!)}
                  className="p-2 hover:bg-red-50 hover:text-red-500 rounded-lg transition-all"
                  title="Excluir"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-auto p-4 border-t border-slate-100">
          {user ? (
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <User size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">{user.email}</p>
                  <p className="text-[10px] text-slate-400">Logado</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setUser(null);
                  localStorage.removeItem(SESSION_KEY);
                }}
                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                title="Sair"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setShowLoginModal(true)}
              className="w-full py-2 px-4 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-xs font-bold transition-all"
            >
              Fazer Login
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative bg-[#fcfcfd] w-full min-w-0">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between p-4 bg-white border-b border-slate-100 z-30">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 hover:bg-slate-50 rounded-xl text-slate-600 transition-all"
          >
            <Bot size={24} />
          </button>
          <div className="flex items-center gap-2">
            <Zap size={20} className="text-indigo-600" fill="currentColor" />
            <span className="font-black text-lg tracking-tighter text-slate-900">AI FORGE</span>
          </div>
          <div className="w-10" /> {/* Spacer */}
        </div>

        <AnimatePresence mode="wait">
          {isCreating ? (
            <motion.div 
              key="creator"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex-1 flex flex-col items-center justify-center p-8 max-w-2xl mx-auto w-full"
            >
              <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-3xl flex items-center justify-center mb-8 shadow-inner">
                <Brain size={40} />
              </div>
              <h2 className="text-3xl font-bold text-slate-900 mb-2 text-center">O que devo forjar hoje?</h2>
              <p className="text-slate-500 mb-10 text-center max-w-md">
                Descreva o especialista que você precisa. Eu definirei sua personalidade, especialidade e identidade visual.
              </p>
              
              <form onSubmit={handleCreateAgent} className="w-full space-y-4">
                <div className="relative">
                  <textarea 
                    value={creationPrompt}
                    onChange={(e) => setCreationPrompt(e.target.value)}
                    placeholder="ex: Um mentor de escrita criativa que ajuda com metáforas e construção de mundos..."
                    className="w-full h-32 p-5 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all resize-none shadow-sm text-lg"
                    disabled={isGenerating}
                  />
                  {isGenerating && (
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center gap-3">
                      <Loader2 className="animate-spin text-indigo-600" size={32} />
                      <p className="text-sm font-bold text-indigo-600 animate-pulse">Forjando Agente...</p>
                    </div>
                  )}
                </div>
                <button 
                  type="submit"
                  disabled={isGenerating || !creationPrompt.trim()}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-2xl font-bold text-lg shadow-lg shadow-indigo-200 transition-all active:scale-[0.99] flex items-center justify-center gap-2"
                >
                  {isGenerating ? 'Gerando...' : 'Criar Especialista'}
                  <ChevronRight size={20} />
                </button>
              </form>
            </motion.div>
          ) : isEditing && editForm ? (
            <motion.div 
              key="editor"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex-1 flex flex-col p-8 max-w-3xl mx-auto w-full overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div 
                    className="w-12 h-12 rounded-xl flex items-center justify-center shadow-sm"
                    style={{ backgroundColor: `${editForm.color}20`, color: editForm.color }}
                  >
                    <IconRenderer name={editForm.icon} size={24} />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900">Editar Especialista</h2>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    type="submit"
                    form="edit-agent-form"
                    className="py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-md shadow-indigo-200 transition-all active:scale-[0.95] flex items-center gap-2"
                  >
                    <Save size={16} />
                    Salvar
                  </button>
                  <button 
                    onClick={() => setIsEditing(false)}
                    className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400 hover:text-slate-600"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <form id="edit-agent-form" onSubmit={handleUpdateAgent} className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Nome</label>
                    <input 
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                      className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Cor (Hex)</label>
                    <div className="flex gap-2">
                      <input 
                        type="color"
                        value={editForm.color}
                        onChange={(e) => setEditForm({...editForm, color: e.target.value})}
                        className="w-12 h-12 p-1 bg-white border border-slate-200 rounded-xl cursor-pointer"
                      />
                      <input 
                        type="text"
                        value={editForm.color}
                        onChange={(e) => setEditForm({...editForm, color: e.target.value})}
                        className="flex-1 p-3 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Ícone</label>
                  <div className="grid grid-cols-7 gap-2 p-3 bg-white border border-slate-200 rounded-xl">
                    {Object.keys(ICON_MAP).map(iconName => (
                      <button
                        key={iconName}
                        type="button"
                        onClick={() => setEditForm({...editForm, icon: iconName})}
                        className={`p-2 rounded-lg flex items-center justify-center transition-all ${
                          editForm.icon === iconName 
                          ? 'bg-indigo-100 text-indigo-600 ring-2 ring-indigo-500' 
                          : 'hover:bg-slate-50 text-slate-400'
                        }`}
                      >
                        <IconRenderer name={iconName} size={18} />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Tipo de Especialista</label>
                  <select 
                    value={editForm.type || 'text'}
                    onChange={(e) => setEditForm({...editForm, type: e.target.value as 'text' | 'image'})}
                    className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all"
                  >
                    <option value="text">Texto (Conversa e Análise)</option>
                    <option value="image">Imagens (Geração Criativa)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Descrição Curta</label>
                  <input 
                    type="text"
                    value={editForm.description}
                    onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                    className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Instruções de Sistema (Personalidade e Expertise)</label>
                  <textarea 
                    value={editForm.system_instruction}
                    onChange={(e) => setEditForm({...editForm, system_instruction: e.target.value})}
                    className="w-full h-48 p-4 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all resize-none"
                  />
                </div>

                <div className="pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-lg transition-all active:scale-[0.99]"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </motion.div>
          ) : selectedAgent ? (
            <motion.div 
              key="chat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex flex-col h-full"
            >
              {/* Chat Header */}
              <header className="p-4 md:p-6 border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-4 w-full md:w-auto">
                  <div 
                    className="w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0"
                    style={{ backgroundColor: `${selectedAgent.color}20`, color: selectedAgent.color }}
                  >
                    <IconRenderer name={selectedAgent.icon} size={24} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-bold text-lg md:text-xl text-slate-900 truncate">{selectedAgent.name}</h2>
                    <p className="text-xs md:text-sm text-slate-500 truncate">{selectedAgent.description}</p>
                  </div>
                </div>
                
                <div className="flex items-center justify-between md:justify-end gap-3 w-full md:w-auto">
                  <div className="relative flex-1 md:flex-none">
                    <button 
                      onClick={() => setShowChatList(!showChatList)}
                      className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-sm font-bold transition-all shadow-sm"
                    >
                      <MessageSquare size={16} />
                      Conversas
                    </button>

                    {showChatList && (
                      <div className="absolute top-full right-0 mt-2 w-72 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden">
                        <div className="p-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2">Histórico de Chats</span>
                          <button 
                            onClick={() => { handleNewChat(selectedAgent.id!, user!.id); setShowChatList(false); }}
                            className="p-2 hover:bg-white rounded-xl text-indigo-600 transition-all shadow-sm border border-slate-100"
                            title="Nova Conversa"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
                          {chats.length === 0 ? (
                            <p className="text-center py-4 text-xs text-slate-400">Nenhuma conversa ainda.</p>
                          ) : (
                            chats.map(chat => (
                              <div 
                                key={chat.id}
                                onClick={() => { handleSelectChat(chat.id); setShowChatList(false); }}
                                className={`p-3 rounded-xl cursor-pointer text-sm transition-all flex items-center justify-between group/chat ${
                                  currentChatId === chat.id ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-100' : 'hover:bg-slate-50 text-slate-600'
                                }`}
                                title={chat.title}
                              >
                                <span className="truncate pr-2">{chat.title}</span>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={(e) => handleDeleteChat(e, chat.id)}
                                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                    title="Excluir conversa"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                  {currentChatId === chat.id && <div className="w-2 h-2 rounded-full bg-indigo-600 shadow-sm shadow-indigo-200" />}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="px-3 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase tracking-wider rounded-full border border-emerald-100">
                    Ativo
                  </div>
                </div>
              </header>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
                {messages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-50 p-8 text-center">
                    <MessageSquare size={48} className="mb-4" />
                    <p className="font-medium">Inicie uma conversa com {selectedAgent.name}</p>
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[90%] md:max-w-[80%] flex gap-2 md:gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                      <div className={`w-7 h-7 md:w-8 md:h-8 rounded-lg flex-shrink-0 flex items-center justify-center ${
                        msg.role === 'user' ? 'bg-slate-900 text-white' : 'bg-indigo-100 text-indigo-600'
                      }`}>
                        {msg.role === 'user' ? <User size={14} /> : <IconRenderer name={selectedAgent.icon} size={14} />}
                      </div>
                      <div className={`p-3 md:p-4 rounded-2xl text-sm leading-relaxed shadow-sm prose prose-sm max-w-none ${
                        msg.role === 'user' 
                        ? 'bg-slate-900 text-white rounded-tr-none prose-invert' 
                        : 'bg-white border border-slate-100 text-slate-700 rounded-tl-none'
                      }`}>
                        {msg.image && (
                          <div className="mb-4 space-y-2">
                            <div className="rounded-xl overflow-hidden border border-slate-100 shadow-sm max-w-full">
                              <img src={msg.image} alt="Gerada por IA" className="w-full h-auto object-cover" referrerPolicy="no-referrer" />
                            </div>
                            <a 
                              href={msg.image} 
                              download={`ai-forge-image-${Date.now()}.png`}
                              className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-all active:scale-95"
                            >
                              <Download size={14} />
                              Baixar
                            </a>
                          </div>
                        )}
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-slate-100 p-3 md:p-4 rounded-2xl rounded-tl-none shadow-sm flex gap-1">
                      <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                      <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                      <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Input */}
              <div className="p-4 md:p-6 bg-white border-t border-slate-200">
                <form onSubmit={handleSendMessage} className="relative max-w-4xl mx-auto">
                  <input 
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={`Mensagem para ${selectedAgent.name}...`}
                    className="w-full py-3 md:py-4 pl-4 md:pl-6 pr-14 md:pr-16 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-sm md:text-base"
                  />
                  <button 
                    type="submit"
                    disabled={!chatInput.trim() || isTyping}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 md:w-12 md:h-12 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl transition-all active:scale-95 flex items-center justify-center shadow-lg shadow-indigo-200"
                  >
                    <Send size={18} />
                  </button>
                </form>
              </div>
            </motion.div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-400">
              <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-6">
                <Bot size={48} />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">Bem-vindo ao AI Forge</h2>
              <p className="max-w-xs text-center">Selecione um agente na barra lateral ou crie um novo para começar.</p>
            </div>
          )}
        </AnimatePresence>

        {/* Login Modal */}
        <AnimatePresence>
          {showLoginModal && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl"
              >
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-slate-900">
                    {isRegistering ? 'Criar Conta' : 'Acesso Necessário'}
                  </h2>
                  <button onClick={() => { setShowLoginModal(false); setIsRegistering(false); }} className="p-2 hover:bg-slate-100 rounded-full">
                    <X size={20} />
                  </button>
                </div>
                <p className="text-slate-500 mb-6">
                  {isRegistering 
                    ? 'Preencha os dados abaixo para criar sua conta no AI Forge.' 
                    : 'Faça login para começar a criar seus próprios especialistas de IA.'}
                </p>

                <div className="space-y-4">
                  <button 
                    type="button"
                    onClick={handleGoogleLogin}
                    className="w-full py-4 bg-white border border-slate-200 text-slate-700 rounded-2xl font-bold text-lg shadow-sm hover:bg-slate-50 transition-all active:scale-[0.99] flex items-center justify-center gap-3"
                  >
                    <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
                    Continuar com Google
                  </button>

                  <div className="relative py-2">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-100"></div>
                    </div>
                    <div className="relative flex justify-center text-[10px] uppercase">
                      <span className="bg-white px-2 text-slate-400 font-bold tracking-widest">Ou use seu e-mail</span>
                    </div>
                  </div>
                </div>
                
                <form onSubmit={handleLogin} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">E-mail</label>
                    <input 
                      type="email" 
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="seu@email.com"
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Senha</label>
                    <input 
                      type="password" 
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                  
                  {loginError && (
                    <p className="text-red-500 text-sm font-medium">{loginError}</p>
                  )}

                  <button 
                    type="submit"
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-lg shadow-lg shadow-indigo-200 transition-all active:scale-[0.99]"
                  >
                    {isRegistering ? 'Criar Conta' : 'Entrar'}
                  </button>
                  
                  <button 
                    type="button"
                    onClick={() => { setIsRegistering(!isRegistering); setLoginError(''); }}
                    className="w-full text-sm text-indigo-600 font-semibold hover:underline mt-2"
                  >
                    {isRegistering 
                      ? 'Já tem uma conta? Faça login' 
                      : 'Não tem uma conta? Crie aqui'}
                  </button>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
