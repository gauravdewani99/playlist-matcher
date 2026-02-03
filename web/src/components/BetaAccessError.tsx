import "./BetaAccessError.css";

interface BetaAccessErrorProps {
  onBack: () => void;
}

export function BetaAccessError({ onBack }: BetaAccessErrorProps) {
  return (
    <div className="beta-error-page">
      <div className="beta-error-container">
        <div className="beta-badge">BETA</div>

        <h1 className="beta-error-title">Join the beta</h1>

        <p className="beta-error-message">
          Sortify is currently in beta mode. Want early access?{" "}
          <a
            href="https://www.linkedin.com/in/gaurav-dewani-0a4973167/"
            target="_blank"
            rel="noopener noreferrer"
            className="beta-link"
          >
            Reach out
          </a>{" "}
          to me with your email associated with your Spotify account and I'll get you set up.
        </p>

        <button className="beta-back-btn" onClick={onBack}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
          </svg>
          Back to Home
        </button>
      </div>
    </div>
  );
}
