import { useCallback, useEffect, useState } from 'react';
import {
  cheer,
  fetchCheers,
  fetchFeed,
  type Cheer,
  type Contact,
  type FeedItem,
} from '../../sync/social.ts';
import { getClient } from '../../sync/supabase.ts';
import { dayTitle } from '../format.ts';
import { HeroAvatar } from '../HeroAvatar.tsx';
import { Icon } from '../Icon.tsx';

const SHOWN = 30;

type Props = { me: string; friends: Contact[]; today: string };

/** What friends did lately, with a cheer button; and who cheered your own things. */
export function Feed({ me, friends, today }: Props) {
  const [items, setItems] = useState<FeedItem[] | undefined>();
  const [cheers, setCheers] = useState<Cheer[]>([]);
  const ids = friends.map((f) => f.id).join(',');

  const load = useCallback(async () => {
    try {
      const c = await getClient();
      const [feed, given] = await Promise.all([
        fetchFeed(c, ids ? ids.split(',') : []),
        fetchCheers(c),
      ]);
      setItems(feed);
      setCheers(given);
    } catch {
      setItems((x) => x ?? []);
    }
  }, [ids]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const nameOf = new Map(friends.map((f) => [f.id, f.username ?? 'Friend']));
  const friendOf = new Map(friends.map((f) => [f.id, f]));
  const mine = new Set(
    cheers.filter((c) => c.from === me).map((c) => `${c.owner}/${c.activityId}`),
  );
  const forMe = cheers.filter((c) => c.owner === me).slice(0, 5);

  async function toggle(item: FeedItem) {
    const key = `${item.owner}/${item.id}`;
    const on = !mine.has(key);
    // show it at once; the next load corrects it if the server said no
    setCheers((cs) =>
      on
        ? [
            { owner: item.owner, activityId: item.id, from: me, at: new Date().toISOString() },
            ...cs,
          ]
        : cs.filter((c) => !(c.from === me && c.owner === item.owner && c.activityId === item.id)),
    );
    try {
      await cheer(await getClient(), me, item.owner, item.id, on);
    } catch {
      await load();
    }
  }

  return (
    <section className="quest-section" aria-label="What friends did lately">
      <h2>Lately</h2>
      {forMe.length > 0 && (
        <ul className="cheered-you" aria-label="Cheers for you">
          {forMe.map((c) => (
            <li key={`${c.from}/${c.activityId}`}>
              <Icon name="star" size={18} /> <b>{nameOf.get(c.from) ?? 'A friend'}</b> cheered you
              on
            </li>
          ))}
        </ul>
      )}
      {items === undefined && <p className="muted">Loading…</p>}
      {items && items.length === 0 && (
        <p className="muted">
          Nothing yet. Workouts, runs and quests your friends share show up here.
        </p>
      )}
      {items && items.length > 0 && (
        <ul className="entry-list feed">
          {items.slice(0, SHOWN).map((item) => {
            const friend = friendOf.get(item.owner);
            const on = mine.has(`${item.owner}/${item.id}`);
            return (
              <li key={`${item.owner}/${item.id}`} className="entry feed-item">
                <HeroAvatar
                  hero={friend?.profile?.hero}
                  look={friend?.profile?.heroLook}
                  size={36}
                />
                <span className="entry-name">
                  <b>
                    {nameOf.get(item.owner)}: {item.data.title}
                  </b>
                  <span className="muted">
                    {[dayTitle(item.data.date, today), item.data.detail]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <button
                  type="button"
                  className="cheer-btn"
                  aria-pressed={on}
                  aria-label={`Cheer ${nameOf.get(item.owner)}: ${item.data.title}`}
                  onClick={() => void toggle(item)}
                >
                  <Icon name="star" size={22} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
