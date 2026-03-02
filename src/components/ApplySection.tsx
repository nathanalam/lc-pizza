const ApplySection = () => (
  <section id="apply" className="py-24 bg-foreground text-background">
    <div className="max-w-4xl mx-auto px-6 text-center">
      <h2 className="font-heading text-4xl md:text-5xl font-bold uppercase">
        Join Our Family
      </h2>
      <p className="font-body text-lg mt-6 opacity-80 max-w-2xl mx-auto leading-relaxed">
        We're always looking for hard-working, honest people who want to grow with us. Whether you're starting your first job or looking for a leadership role, there's a place for you at Alam Pizza Group.
      </p>
      <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
        <a
          href="https://littlecaesars.com/en-us/careers/"
          target="_blank"
          rel="noopener noreferrer"
          className="px-8 py-4 bg-primary text-primary-foreground font-heading text-sm uppercase tracking-wide rounded-full hover:opacity-90 transition-opacity"
        >
          Apply Now
        </a>
        <a
          href="mailto:careers@alampizzagroup.com"
          className="px-8 py-4 border-2 border-background/30 text-background font-heading text-sm uppercase tracking-wide rounded-full hover:bg-background/10 transition-colors"
        >
          Email Us
        </a>
      </div>
    </div>
  </section>
);

export default ApplySection;
