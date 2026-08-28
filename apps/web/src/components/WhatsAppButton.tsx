type Props = {
  phone: string;
  hallName?: string;
  date?: string;
};

export default function WhatsAppButton({ phone, hallName, date }: Props) {
  // wa.me expects digits with no '+' prefix.
  const digits = phone.replace(/^\+/, '').replace(/\D/g, '');
  const message =
    `Hi, I saw ${hallName ? `"${hallName}"` : 'your hall'} on CheckNBook.` +
    (date ? ` Is it available on ${date}?` : ' Is it available?');
  const href = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  return (
    <a className="btn btn--whatsapp" href={href} target="_blank" rel="noopener noreferrer">
      WhatsApp
    </a>
  );
}
