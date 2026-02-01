'use client';

import { useState } from 'react';
import { MessageCircle, X, Mail, Instagram } from 'lucide-react';

// Facebook Messenger icon (not available in lucide-react)
const MessengerIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.13.26.35.27.57l.05 1.78c.02.63.63 1.04 1.21.82l1.98-.78c.17-.07.36-.09.54-.05.9.25 1.86.39 2.81.39 5.64 0 10-4.13 10-9.7S17.64 2 12 2zm5.89 7.64l-2.88 4.58c-.46.73-1.41.91-2.09.4l-2.29-1.72a.6.6 0 00-.72 0l-3.09 2.34c-.41.31-.95-.18-.67-.62l2.88-4.58c.46-.73 1.41-.91 2.09-.4l2.29 1.72a.6.6 0 00.72 0l3.09-2.34c.41-.31.95.18.67.62z" />
  </svg>
);

interface ContactOption {
  name: string;
  icon: React.ReactNode;
  href: string;
  bgColor: string;
  hoverBgColor: string;
}

const contactOptions: ContactOption[] = [
  {
    name: 'Email',
    icon: <Mail className="w-6 h-6" />,
    href: 'mailto:marshalvinica@gmail.com',
    bgColor: 'bg-red-500',
    hoverBgColor: 'hover:bg-red-600',
  },
  {
    name: 'Instagram',
    icon: <Instagram className="w-6 h-6" />,
    href: 'https://www.instagram.com/marshalonlinemk',
    bgColor: 'bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600',
    hoverBgColor: 'hover:opacity-90',
  },
  {
    name: 'Messenger',
    icon: <MessengerIcon />,
    href: 'https://m.me/marshalonlinemk',
    bgColor: 'bg-blue-500',
    hoverBgColor: 'hover:bg-blue-600',
  },
];

export default function FloatingContactButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col-reverse items-center gap-3">
      {/* Main toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 ${
          isOpen
            ? 'bg-gray-700 hover:bg-gray-800 rotate-0'
            : 'bg-black hover:bg-gray-800'
        }`}
        aria-label={isOpen ? 'Close contact options' : 'Open contact options'}
      >
        <div className={`transition-transform duration-300 ${isOpen ? 'rotate-90' : 'rotate-0'}`}>
          {isOpen ? (
            <X className="w-6 h-6 text-white" />
          ) : (
            <MessageCircle className="w-6 h-6 text-white" />
          )}
        </div>
      </button>

      {/* Contact options */}
      <div className={`flex flex-col gap-3 transition-all duration-300 ${
        isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      }`}>
        {contactOptions.map((option, index) => (
          <a
            key={option.name}
            href={option.href}
            target="_blank"
            rel="noopener noreferrer"
            className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-white transition-all duration-300 ${option.bgColor} ${option.hoverBgColor}`}
            style={{
              transitionDelay: isOpen ? `${index * 50}ms` : '0ms',
              transform: isOpen ? 'scale(1)' : 'scale(0.5)',
              opacity: isOpen ? 1 : 0,
            }}
            aria-label={`Contact us on ${option.name}`}
            title={option.name}
          >
            {option.icon}
          </a>
        ))}
      </div>
    </div>
  );
}
