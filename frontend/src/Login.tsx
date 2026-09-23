import {useState} from 'react'
import {Link} from 'react-router-dom'
import logo from './assets/logo.jpeg'
import './App.css'
import './Login.css'

function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        console.log(`Your username ${username}`);
        console.log(`Your password ${password}`);
    }
 
    return (
        <div className="login-page">
            <div className="info-section">
                <div className="blueprint-grid" />
                <div className="info-content">
                    <img src={logo} alt="Sohail Malik Architects" className="brand-logo" />

                    <svg className="info-lines" viewBox="0 0 400 220" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path className="draw-line" d="M60 170 L200 90 L340 170" stroke="var(--color-gold)" strokeWidth="1" opacity="0.6" />
                        <path className="draw-line" d="M60 170 L60 100 L200 20 L340 100 L340 170" stroke="var(--color-gold)" strokeWidth="1" opacity="0.3" />
                        <line className="draw-line" x1="200" y1="20" x2="200" y2="90" stroke="var(--color-gold)" strokeWidth="1" opacity="0.6" />
                        {/* dimension line + tick marks, drafting convention */}
                        <line className="draw-line" x1="60" y1="185" x2="340" y2="185" stroke="var(--color-text-muted)" strokeWidth="0.75" opacity="0.5" />
                        <line x1="60" y1="180" x2="60" y2="190" stroke="var(--color-text-muted)" strokeWidth="0.75" opacity="0.5" />
                        <line x1="340" y1="180" x2="340" y2="190" stroke="var(--color-text-muted)" strokeWidth="0.75" opacity="0.5" />
                        <text x="200" y="205" textAnchor="middle" fill="var(--color-text-muted)" fontSize="9" fontFamily="Inter, sans-serif" opacity="0.6">
                            EST. LEDGER SYSTEM
                        </text>
                    </svg>

                    <div className="title-block">
                        <div className="title-block-row">
                            <span>PROJECT</span>
                            <span>ACCESS LEDGER</span>
                        </div>
                        <div className="title-block-row">
                            <span>SCALE</span>
                            <span>N.T.S.</span>
                        </div>
                        <div className="title-block-row">
                            <span>DRAWN BY</span>
                            <span>S.M. ARCHITECTS</span>
                        </div>
                        <div className="title-block-row highlight">
                            <span>STATUS</span>
                            <span>AUTHORIZED ACCESS ONLY</span>
                        </div>
                    </div>
                </div>
            </div>
            <div className="login-section">
                <form className="login-card" onSubmit={handleSubmit}>
                    <div>
                        <h1>Welcome back</h1>
                        <p className="subtitle">Sign in to your account</p>
                    </div>
                    <div className="field">
                        <label htmlFor="username">Username</label>
                        <input
                            id="username"
                            name="username"
                            type="text"
                            autoComplete="username"
                            placeholder="Enter your username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                        />
                    </div>
                    <div className="field">
                        <label htmlFor="password">Password</label>
                        <input
                            type="password"
                            id="password"
                            name="password"
                            autoComplete="current-password"
                            placeholder="Enter your password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <button className="login-button" type="submit">
                        Login
                    </button>
                    <Link to="/" className="app-link">Go to app</Link>
                </form>
            </div>
        </div>
    )
}

export { Login }