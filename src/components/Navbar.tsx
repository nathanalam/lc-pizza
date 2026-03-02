import { useState } from "react";
import { Menu, X } from "lucide-react";

const navLinks = [
  { label: "Locations", href: "#locations" },
  { label: "About Us", href: "#about" },
  { label: "Partnerships", href: "#partnerships" },
];

const Navbar = () => {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-16">
        <a href="#" className="font-heading text-2xl font-bold tracking-tight text-foreground uppercase">
          Alam Pizza Group
        </a>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((l) => (
            <a key={l.href} href={l.href} className="font-body text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
              {l.label}
            </a>
          ))}
          <a
            href="#apply"
            className="px-5 py-2 rounded-full border-2 border-primary text-primary font-heading text-sm font-semibold uppercase tracking-wide hover:bg-primary hover:text-primary-foreground transition-colors"
          >
            Apply Now
          </a>
        </div>

        {/* Mobile toggle */}
        <button className="md:hidden text-foreground" onClick={() => setOpen(!open)} aria-label="Toggle menu">
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-background border-b border-border px-6 pb-4 space-y-3">
          {navLinks.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block font-body text-base text-muted-foreground hover:text-primary">
              {l.label}
            </a>
          ))}
          <a href="#apply" onClick={() => setOpen(false)} className="block font-heading text-sm font-semibold uppercase text-primary">
            Apply Now
          </a>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
