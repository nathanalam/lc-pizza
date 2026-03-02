import heroPizza from "@/assets/hero-pizza.jpg";

const HeroSection = () => (
  <section className="relative min-h-[90vh] flex items-center pt-16">
    <div className="max-w-7xl mx-auto px-6 w-full grid md:grid-cols-2 gap-12 items-center">
      <div className="space-y-6 animate-fade-in-up">
        <h1 className="font-heading text-5xl md:text-7xl font-bold uppercase leading-[0.95] text-foreground">
          Serving Up More
          <span className="block text-primary italic font-normal normal-case text-4xl md:text-6xl mt-2">
            than just pizza.
          </span>
        </h1>
        <div className="w-16 h-1 bg-primary rounded-full" />
        <p className="font-body text-lg text-muted-foreground max-w-md leading-relaxed">
          Alam Pizza Group is a family of locally owned Little Caesars restaurants across the Washington D.C. and Baltimore metro area. We believe in hard work, honesty, and treating every team member like family.
        </p>
        <div className="flex flex-wrap gap-4">
          <a
            href="#about"
            className="px-6 py-3 bg-primary text-primary-foreground font-heading text-sm uppercase tracking-wide rounded-full hover:opacity-90 transition-opacity"
          >
            Get to Know Us
          </a>
          <a
            href="#locations"
            className="px-6 py-3 border-2 border-foreground text-foreground font-heading text-sm uppercase tracking-wide rounded-full hover:bg-foreground hover:text-background transition-colors"
          >
            Our Locations
          </a>
        </div>
      </div>
      <div className="relative animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
        <div className="rounded-2xl overflow-hidden shadow-2xl">
          <img src={heroPizza} alt="Delicious pepperoni pizza with stretchy melted cheese" className="w-full h-[400px] md:h-[520px] object-cover" />
        </div>
      </div>
    </div>
  </section>
);

export default HeroSection;
