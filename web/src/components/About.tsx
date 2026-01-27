import "./About.css";

interface AboutProps {
  onBack: () => void;
}

export function About({ onBack }: AboutProps) {
  return (
    <div className="about-page">
      <header className="about-header">
        <button className="back-btn" onClick={onBack}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
          </svg>
          Back
        </button>
      </header>

      <main className="about-content">
        <div className="about-hero">
          <h1 className="about-title">
            <span className="title-gradient">Sortify</span>
          </h1>
          <p className="about-tagline">Your liked songs, perfectly organized.</p>
        </div>

        <section className="about-section">
          <h2>What is Sortify?</h2>
          <p>
            Sortify is a smart tool built on the Spotify Web API that automatically
            sorts your Liked Songs into the right playlists. Just like a song and
            let Sortify handle the rest.
          </p>
        </section>

        <section className="about-section">
          <h2>How it works</h2>
          <div className="feature-grid">
            <div className="feature-card">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                </svg>
              </div>
              <h3>Smart Matching</h3>
              <p>
                Sortify analyzes each track's genre, tempo, energy, popularity, and
                other metadata to calculate a compatibility score with your playlists.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
                </svg>
              </div>
              <h3>Automatic Syncing</h3>
              <p>
                Set your preferred schedule and Sortify runs automatically in the
                background. Your playlists stay fresh without lifting a finger.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                </svg>
              </div>
              <h3>Full Control</h3>
              <p>
                Don't like a match? Override it anytime. View your match history on
                the dashboard and reassign songs to different playlists.
              </p>
            </div>
          </div>
        </section>

        <section className="about-section">
          <h2>Best practices</h2>
          <ul className="tips-list">
            <li>
              <span className="tip-icon">1</span>
              <span>Have at least <strong>20 liked songs</strong> for better matching accuracy</span>
            </li>
            <li>
              <span className="tip-icon">2</span>
              <span>Create at least <strong>3 playlists</strong> with different vibes or genres</span>
            </li>
            <li>
              <span className="tip-icon">3</span>
              <span>Each playlist should have <strong>5+ songs</strong> so Sortify can learn its style</span>
            </li>
            <li>
              <span className="tip-icon">4</span>
              <span>Sortify only adds songs to <strong>playlists you own</strong>—not followed ones</span>
            </li>
          </ul>
        </section>

        <section className="about-section">
          <h2>Good to know</h2>
          <div className="info-cards">
            <div className="info-card">
              <span className="info-emoji">🔄</span>
              <p>Once a song is added to a playlist, Sortify won't add it again</p>
            </div>
            <div className="info-card">
              <span className="info-emoji">📊</span>
              <p>The dashboard shows your complete match history</p>
            </div>
            <div className="info-card">
              <span className="info-emoji">⚡</span>
              <p>Sync runs on your schedule—daily, weekly, or however you like</p>
            </div>
          </div>
        </section>

        <section className="about-section beta-section">
          <div className="beta-badge">BETA</div>
          <h2>Join the beta</h2>
          <p>
            Sortify is currently in beta mode. Want early access?{" "}
            <a
              href="https://www.linkedin.com/in/gaurav-dewani-0a4973167/"
              target="_blank"
              rel="noopener noreferrer"
              className="reach-out-link"
            >
              Reach out
            </a>{" "}
            to me with your email associated with your Spotify account and I'll get you set up.
          </p>
        </section>

        <footer className="about-footer">
          <p>Built with 💚 for music lovers</p>
        </footer>
      </main>
    </div>
  );
}
