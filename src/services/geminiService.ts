import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface Agent {
  id?: number;
  name: string;
  description: string;
  system_instruction: string;
  icon: string;
  color: string;
  type?: 'text' | 'image';
}

export const generateAgentDefinition = async (userRequest: string): Promise<Agent> => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Você é o "Mestre Arquiteto de IAs", um especialista em projetar personalidades e capacidades de inteligência artificial altamente sofisticadas.
    
    Sua tarefa é ler o pedido do usuário: "${userRequest}" e transformá-lo em uma definição de Agente de IA de elite.
    
    Instruções:
    1. Utilize a ferramenta de pesquisa (Google Search) para obter informações atualizadas e profundas sobre a área solicitada. Isso ajudará você a criar uma IA com conhecimento técnico real e de ponta.
    2. Analise profundamente o que o usuário quer e aperfeiçoe a ideia. Se o pedido for simples, expanda-o para torná-lo profissional e profundo.
    3. Defina uma "system_instruction" que seja rica em detalhes sobre a personalidade, tom de voz, base de conhecimento e limites do agente.
    4. Todos os agentes que você criar têm a capacidade de gerar imagens incríveis. Inclua na instrução do sistema que eles devem gerar imagens sempre que o usuário pedir ou quando uma representação visual enriquecer a conversa.
    5. Se o pedido for especificamente sobre imagens, defina o tipo como 'image' e crie uma instrução de sistema focada em técnicas artísticas, estilos, iluminação e composição fotográfica de alto nível.
    6. Escolha um ícone do Lucide que melhor represente a essência do agente (ex: 'Brain', 'Code', 'Pen', 'Camera', 'Palette', 'Rocket', 'Heart', 'Shield', 'Zap', 'Globe').
    
    Responda APENAS com o JSON puro, seguindo este esquema:`,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "Nome profissional e impactante para a IA" },
          description: { type: Type.STRING, description: "Uma frase curta que resume a especialidade" },
          system_instruction: { type: Type.STRING, description: "Instrução de sistema detalhada e profunda" },
          icon: { type: Type.STRING, description: "Nome do ícone Lucide" },
          color: { type: Type.STRING, description: "Cor hexadecimal vibrante" },
          type: { type: Type.STRING, enum: ['text', 'image'], description: "Use 'image' se o foco principal for arte visual, 'text' para outros casos" },
        },
        required: ["name", "description", "system_instruction", "icon", "color", "type"],
      },
    },
  });

  const text = response.text || "{}";
  const cleanJson = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleanJson);
};

export const generateChatTitle = async (userMessage: string, assistantResponse: string) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Com base nesta conversa inicial, crie um título curto e criativo (máximo 4 palavras) que resuma o tema principal.
    Usuário: "${userMessage}"
    Assistente: "${assistantResponse}"
    Responda APENAS com o título, sem aspas ou pontuação desnecessária.`,
  });

  return response.text?.trim() || "Nova Conversa";
};

export const chatWithAgent = async (agent: Agent, message: string, history: any[] = []) => {
  // Todos os agentes agora usam o modelo multimodal que gera imagens
  const model = 'gemini-2.5-flash-image';
  
  const systemInstruction = agent.type === 'image' 
    ? `${agent.system_instruction}\n\nVocê é um Especialista Supremo em Imagens. Suas gerações devem ser de qualidade cinematográfica. Após gerar uma imagem, dê sugestões curtas de variações artísticas.`
    : `${agent.system_instruction}\n\nNota: Você tem a capacidade de gerar imagens. Se o usuário pedir uma imagem ou se você achar que uma imagem ajudaria a explicar algo, sinta-se à vontade para gerar uma.`;

  const response = await ai.models.generateContent({
    model: model,
    contents: {
      parts: [
        { text: systemInstruction },
        ...history.map(h => ({ text: `${h.role === 'user' ? 'Usuário' : 'Assistente'}: ${h.content}` })),
        { text: `Usuário: ${message}` },
      ],
    },
    config: {
      imageConfig: {
        aspectRatio: "1:1",
      },
    },
  });

  let imageUrl = '';
  let textResponse = '';

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      imageUrl = `data:image/png;base64,${part.inlineData.data}`;
    } else if (part.text) {
      textResponse += part.text;
    }
  }

  return { text: textResponse.trim(), image: imageUrl };
};
