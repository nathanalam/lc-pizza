import { Heart, Users, Star } from "lucide-react";

const values = [
  {
    icon: Heart,
    title: "Family First",
    description: "We treat every team member as part of our family. From day one, you belong here.",
  },
  {
    icon: Star,
    title: "Hard Work & Honesty",
    description: "We believe in earning everything through dedication and treating people right — always.",
  },
  {
    icon: Users,
    title: "Community Driven",
    description: "We invest in the communities we serve, building partnerships with local schools and organizations.",
  },
];

const AboutSection = () => (
  <section id="about" className="py-24 bg-card">
    <div className="max-w-7xl mx-auto px-6">
      <div className="max-w-2xl mx-auto text-center mb-16">
        <h2 className="font-heading text-4xl md:text-5xl font-bold uppercase text-foreground">
          We're On A Mission
        </h2>
        <p className="font-heading text-2xl md:text-3xl text-primary italic font-normal mt-2">
          to build something bigger.
        </p>
        <p className="font-body text-muted-foreground mt-6 text-lg leading-relaxed">
          Led by Mohammed Shofekul Alam, our growing family of Little Caesars restaurants is rooted in the belief that great pizza and great people go hand in hand. We hire for character, develop potential, and create a workplace where hard work and honesty are valued above all else.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {values.map((v) => (
          <div key={v.title} className="bg-background rounded-2xl p-8 text-center shadow-sm hover:shadow-md transition-shadow">
            <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-primary/10 flex items-center justify-center">
              <v.icon className="w-7 h-7 text-primary" />
            </div>
            <h3 className="font-heading text-xl font-semibold uppercase text-foreground mb-3">{v.title}</h3>
            <p className="font-body text-muted-foreground leading-relaxed">{v.description}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default AboutSection;
