import type { ContentPage } from '../types';
import { page as pdbViewer } from './pdb-viewer';
import { page as alphafoldViewer } from './alphafold-viewer';
import { page as mmcifViewer } from './mmcif-viewer';
import { page as sdfViewer } from './sdf-viewer';
import { page as xyzViewer } from './xyz-viewer';
import { page as pymolAlternative } from './pymol-online-alternative';
import { page as compare } from './compare';
import { page as about } from './about';
import { page as howToReadAPdbFile } from './learn/how-to-read-a-pdb-file';
import { page as alphaHelicesAndBetaSheets } from './learn/alpha-helices-and-beta-sheets';
import { page as howToViewAnAlphafoldPrediction } from './learn/how-to-view-an-alphafold-prediction';
import { page as plddtExplained } from './learn/plddt-explained';

export const pages: ContentPage[] = [
  pdbViewer,
  alphafoldViewer,
  mmcifViewer,
  sdfViewer,
  xyzViewer,
  pymolAlternative,
  compare,
  about,
  howToReadAPdbFile,
  alphaHelicesAndBetaSheets,
  howToViewAnAlphafoldPrediction,
  plddtExplained,
];
