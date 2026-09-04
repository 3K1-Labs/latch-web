import Image from 'next/image';
import { WaitlistForm } from './waitlist-form';

export default function Home() {
  return (
    <main className="waitlist-page">
      <section className="waitlist-hero" aria-labelledby="waitlist-heading">
        <div className="waitlist-copy-panel">
          <div className="waitlist-content">
            <Image
              className="latch-logo"
              src="/latch.png"
              alt="Latch"
              width={72}
              height={72}
              priority
            />

            <div className="waitlist-intro">
              <h1 id="waitlist-heading">Join the Road to Mainnet.</h1>
              <p>Follow Latch as we prepare for mainnet on Stellar.</p>
            </div>

            <div className="waitlist-signup">
              <WaitlistForm />
              <p className="waitlist-note">Product updates, early previews, and launch news.</p>
            </div>
          </div>
        </div>

        <aside className="waitlist-media" aria-hidden="true">
          <Image
            className="waitlist-media-image"
            src="/latch.png"
            alt=""
            fill
            sizes="(min-width: 60rem) 46vw, 0px"
          />
        </aside>
      </section>
    </main>
  );
}
