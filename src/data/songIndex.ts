import { Song } from '../types';

// Import all songs
import schoolBell from './songs/beginner/school-bell.json';
import twinkleTwinkle from './songs/beginner/twinkle-twinkle.json';
import butterfly from './songs/beginner/butterfly.json';
import maryLamb from './songs/beginner/mary-lamb.json';
import happyBirthday from './songs/beginner/happy-birthday.json';
import threeBears from './songs/beginner/three-bears.json';
import mountainRabbit from './songs/beginner/mountain-rabbit.json';
import tulip from './songs/beginner/tulip.json';
import inuNoOmawariSan from './songs/beginner/inu-no-omawari-san.json';
import donguriKorokoro from './songs/beginner/donguri-korokoro.json';
import yuki from './songs/beginner/yuki.json';
import usagiToKame from './songs/beginner/usagi-to-kame.json';
import teruTeruBozu from './songs/beginner/teru-teru-bozu.json';
import kaeruNoUta from './songs/beginner/kaeru-no-uta.json';
import roundRound from './songs/beginner/round-round.json';
import tadpoleFrog from './songs/beginner/tadpole-frog.json';
import foxFox from './songs/beginner/fox-fox.json';
import akatonbo from './songs/beginner/akatonbo.json';
import umi from './songs/beginner/umi.json';
import yuyakeKoyake from './songs/beginner/yuyake-koyake.json';
import furusato from './songs/beginner/furusato.json';
import momiji from './songs/beginner/momiji.json';
import islandBaby from './songs/easy/island-baby.json';

export const allSongs: Song[] = [
  schoolBell,
  twinkleTwinkle,
  butterfly,
  maryLamb,
  happyBirthday,
  threeBears,
  mountainRabbit,
  tulip,
  inuNoOmawariSan,
  donguriKorokoro,
  yuki,
  usagiToKame,
  teruTeruBozu,
  kaeruNoUta,
  roundRound,
  tadpoleFrog,
  foxFox,
  akatonbo,
  umi,
  yuyakeKoyake,
  furusato,
  momiji,
  islandBaby
] as Song[];

export const songsByDifficulty = {
  beginner: allSongs.filter(s => s.difficulty === 'beginner'),
  easy: allSongs.filter(s => s.difficulty === 'easy'),
  medium: allSongs.filter(s => s.difficulty === 'medium')
};

export const songsByOrigin = {
  korean: allSongs.filter(s => s.origin === 'korean'),
  japanese: allSongs.filter(s => s.origin === 'japanese')
};

export function getSongById(id: string): Song | undefined {
  return allSongs.find(s => s.id === id);
}

export function getSongsByTag(tag: string): Song[] {
  return allSongs.filter(s => s.tags.includes(tag));
}
