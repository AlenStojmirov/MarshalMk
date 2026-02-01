import Link from 'next/link';
import Image from 'next/image';

interface CategoryCardProps {
  title: string;
  href: string;
  imageSrc: string;
}

export default function CategoryCard({ title, href, imageSrc }: CategoryCardProps) {
  return (
    <Link
      href={href}
      className="relative block w-full h-full min-h-[500px] overflow-hidden group cursor-pointer"
    >
      <Image
        src={imageSrc}
        alt={title}
        fill
        sizes="(max-width: 768px) 100vw, 33vw"
        className="object-cover transition-transform duration-500 group-hover:scale-105"
        priority
      />
      <div className="absolute inset-0 bg-black/30 transition-colors duration-300 group-hover:bg-black/40" />
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-6 tracking-wide">
          {title}
        </h2>
        <span className="px-8 py-3 bg-white text-gray-900 font-semibold text-sm uppercase tracking-wider transition-colors duration-300 hover:bg-gray-100">
          Купи Веднаш
        </span>
      </div>
    </Link>
  );
}
