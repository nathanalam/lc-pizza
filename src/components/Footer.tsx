const Footer = () => (
  <footer className="py-12 bg-foreground text-background/70">
    <div className="max-w-7xl mx-auto px-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <span className="font-heading text-xl font-bold text-background uppercase">Alam Pizza Group</span>
          <p className="font-body text-sm mt-1 opacity-60">Little Caesars Franchisee · Washington D.C. Metro Area</p>
        </div>
        <div className="flex gap-6 font-body text-sm">
          <a href="#locations" className="hover:text-background transition-colors">Locations</a>
          <a href="#about" className="hover:text-background transition-colors">About</a>
          <a href="#apply" className="hover:text-background transition-colors">Careers</a>
          <a href="#partnerships" className="hover:text-background transition-colors">Partnerships</a>
        </div>
      </div>
      <div className="mt-8 pt-6 border-t border-background/10 text-center font-body text-xs opacity-50">
        © {new Date().getFullYear()} Alam Pizza Group. All rights reserved. Little Caesars® is a registered trademark of Little Caesar Enterprises, Inc.
      </div>
    </div>
  </footer>
);

export default Footer;
