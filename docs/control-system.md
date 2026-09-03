# Controls

Convention: thumb up moves on, a wave starts the tour, closed fist goes back.
Held gestures fill a pill and fire once; continuous ones (point, fly, pan,
zoom, time) act every frame while the hand is in that pose.

## Main view

| Control | Action | Built |
|---|---|---|
| Point a finger at a planet, hold about a second | Fly there | yes |
| Thumb up, hold | Fly to the next body (Sun, Mercury ... Neptune) | yes |
| Thumb down, hold | Fly to the previous body | yes |
| Hold two open palms | Navigate the sky | yes |
| Wave a hand (open hand, side to side, at least twice) | Take the tour | yes |
| Closed fist, hold | Back to the whole system | yes |

## Navigate

| Control | Action | Built |
|---|---|---|
| One open palm, move it from where it appeared | Fly that way; further from the start is faster | yes |
| One open palm, bring it closer or pull it back | Push in (zoom in) or pull out (zoom out) | yes |
| Point a finger at a planet, hold | Fly there | yes |
| One hand, index finger touching thumb, move | Pan the sky | yes |
| Two pointed fingers, pinch in or out | Zoom the sky | yes |
| Two fingers up (Victory), raise or lower the hand | Time dial: middle is 1x, top 30x forward, bottom 30x rewind; drop the hand to return to 1x | yes |
| Closed fist, hold | Back to Main view | yes |

## Tour

| Control | Action | Built |
|---|---|---|
| (wait) | Next stop every 9 s; after Neptune, back to Main view | yes |
| Thumb up, hold | Skip ahead | yes |
| Closed fist, hold | Stop the tour, back to Main view | yes |

# Gong

Playing is the whole of the main screen. Swings come from the body model
(the wrists), not the hands: each arm has a mallet on its side of the gong,
and a swing strikes the centre. Where the hand is does not matter. Held
gestures come from the hand model, fill a pill and fire once, and only count
while the hand is still, so an arm mid-swing never fires one. Everything
that changes the gong is in Adjust, behind one gesture, and nothing strikes
there. A closed fist is the way back, as in the sky.

## Play

| Control | Action | Built |
|---|---|---|
| Swing an arm (across, up, or at the camera) | Strike the centre where the swing peaks; faster is louder | yes |
| Both arms swung | Two mallets, one per side; a hit from each | yes |
| Open palm, hold still | Damp the gong (everything ringing fades out) | yes |
| Two fingers up (Victory), hold | Adjust the gong and mallet | yes |

## Adjust

| Control | Action | Built |
|---|---|---|
| Thumb up, hold | Next gong | yes |
| Thumb down, hold | Previous gong | yes |
| Two fingers up (Victory), hold | Next mallet | yes |
| Two pointed fingers, pinch in or out | Resize the gong (50% to 180% of its base diameter) inside the fixed frame | yes |
| Two open palms, hold | Gong bath | yes |
| Closed fist, hold | Back to Play | yes |
| Swing an arm | Nothing: no strikes in Adjust | yes |

## Gong bath

| Control | Action | Built |
|---|---|---|
| (wait) | A soft strike every 2 to 4 s, every fourth louder, now and then a pair or a roll of three; every eighth moves to the next gong and mallet | yes |
| Swing an arm | Join in | yes |
| Thumb up, hold | Next gong | yes |
| Open palm, hold | Damp it (the bath carries on) | yes |
| Closed fist, hold | Stop the bath, back to Play | yes |

## Without a camera

Click or tap the gong to strike it (a flick hits harder), drag across it to
swing (it strikes again where the drag peaks, or where a finger lifts off),
scroll to resize. The keys act directly in any mode: Space strikes near the
centre, `a` opens and closes Adjust, the arrow keys change the gong, `s` the
mallet, `+` and `-` resize, `m` damps, `b` starts the bath, `Esc` goes back
to Play.

A wave is deliberately not a control here: swinging at the gong twice is a
wave, and the bath must not start on its own while someone is banging.
