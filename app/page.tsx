import { redirect } from 'next/navigation';

// A raiz é sempre um redireccionamento: o middleware já garante que só
// utilizadores autenticados chegam aqui (caso contrário, envia para /login).
export default function Home() {
  redirect('/dashboard');
}
