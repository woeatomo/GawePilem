/** Duplikat minimal tipe pesan agar prompt-engine tidak bergantung pada ai-gateway. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
