AI Summary

Subject: Game UI Feedback Discussion

Content: The conversation revolves around the design and functionality of a single-player game interface. Speaker 1 notes that the back button appears misaligned, with a half-circle design that feels off. Speaker 2 agrees, suggesting that the back button should be more symmetrical and centered. They discuss hover text issues, recommending the removal of automatic browser-generated hover text in favor of a single, styled version that maintains accessibility features. The speakers also touch on the differences between the campaign and contest modes in the game, with the contest involving another player and rift control, while the campaign consists of a series of sequential fights. Overall, the dialogue highlights design inconsistencies and the need for improved user interface elements in the game.

The above content is AI-generated and is provided for your reference only.

Speaker 1 00:00:01

So, we are doing a single player game.

Random, so this is like not important at all, but the back button is like weirdly out of sync.

It's like oddly aligned and has a half circle around it in a like diagonal direction.

And I'm kind of...

Speaker 2 00:00:25

I know what the half circle is about.

Speaker 1 00:00:26

Okay.

And this is just like...

Kind of weird, I don't know.

It's not a big deal, but because it's obvious that it works, but yeah.

Speaker 2 00:00:35

The bookmark, the back button, basically everywhere is kind of ****** ** and should be symmetrical, centrally symmetrical and centered.

Speaker 1 00:00:51

Interesting thing where the, like, the hover text is good.

And then another hover text comes up that's like the automatic one.

Speaker 2 00:01:01

Yes.

Make it so that there is no automatic browser-based hover text that comes up when selecting what type of new game to start.

And also look for other places where there's a duplicated hover text natively from a browser and one created by

the UI itself.

Speaker 1 00:01:27

Something worth noting.

Oh yeah, Something possibly worth noting is that the browser-based one is probably more accessible and like well, like has probably things attached to it that are good defaults and it might be better to tell it to hijack the browser-based and style it properly.

Rather than replace it, but this depends on how much, yeah.

How much you want to use saying defaults from browser stuff?

Speaker 2 00:01:51

When de-duplicating, use the browser-based one as the main one, just remove the additional one implemented by us.

Speaker 1 00:02:03

But like style the default one to match the original, maybe?

Speaker 2 00:02:08

Yeah, if it's possible, also style it.

Speaker 1 00:02:14

Cool.

All right, so ladder, start contest via...

Oh, no, wait, that's not what I wanted to do.

Speaker 2 00:02:23

So the campaign and contest are both fine.

Like they are slightly different in how they work.

Like in one, there's another player, kind of like the thing that we were playing, and you are fighting for holding rifts, whereas campaign just gives you a sequence of fights that you want to win.



Speaker 1 00:00:02

Continuing from the previous recording.

Speaker 2 00:00:05

OK, bookmark one, uh, the back button that just looks like, uh, lesser than sign, uh, is kind of messed up and it should be more centered and symmetrical.

Speaker 1 00:00:14

I also just send you both texts. Oh it won't. We don't need to like both things I recorded.

Speaker 2 00:00:18

Oh, OK, fine. Yeah, yeah.

Speaker 1 00:00:21

Uh, humans and goblins begin a contest.

Oh, interesting.

Begin contest feels much more viscerally like obvious what it's doing. I don't forget what the I forget what the previous one was.

Does that button change with each type of thing?

Uh.

Speaker 2 00:00:45

Uh, I mean you should.

You saw that one at the start of the multiplayer game as well, right? But I think it had different text. It did not. The thing that you were thinking of was the Cycle 3 choose a new race thing.

Which is not beginning.

Contact.

Speaker 1 00:01:03

No, no, at the beginning when I selected my troops.

Speaker 2 00:01:06

In the multiplayer version.

Yeah, yeah, I'm pretty sure it used a different phrase.

Maybe and.

Speaker 1 00:01:12

I like this phrase better, so I want to mention that.

Speaker 2 00:01:17

Uh, I'll, I'll, I'll check and see if you keep playing.

Speaker 1 00:01:20

Umm, yeah, it's a submit.

Speaker 2 00:01:25

Ready. Oh, interesting, so the multiplayer version of.

Look for instances of the multiplayer U contest UI being different from the single player contest UI.

Do not change them yet, just create a list of differences to fix later.

Speaker 1 00:01:47

Nice, nice.

Uh.

Was there ever a time when the essence was not at 0? That I feel?

Speaker 2 00:01:59

Like I yes, before you click the oh, uh.

Speaker 1 00:02:03

No, this time I hadn't clicked and.

Speaker 2 00:02:04

It still says it it's it it it it is already automated. It was supposed to be automated in the multiplayer version as well. The terms the spend essence are deprecated basically.

Speaker 1 00:02:15

I see. I see. OK.

Umm, decay Haze.

I think I like haze unless things have low initiative.

See.

Wait, do they have?

Initiative.

Speaker 2 00:02:42

Speed is the thing that gives you initiative every beat.

Speaker 1 00:02:45

Oh, OK, OK, OK.

Uh-huh.

I suppose that's probably more intuitive for somebody who's familiar with how initiative systems work.

Speaker 2 00:02:57

Uh, yes, OK.

Speaker 1 00:02:59

There's something where I kind of would like it to use the same word or like have some easy way of like.

But maybe, yeah, maybe that's not necessary. But if it's at.

Speaker 2 00:03:09

All possible to do that. I would like to do that, but my understanding is that it's basically not possible to do that, and it's possible that words other than speed and initiative that are maybe more conceptually distinct or like their relationship is more obvious, like which one is filling a bar.

And which one is the bar?

Speaker 1 00:03:30

Yeah, but one thing since you're using an icon with it.

Is it possible that when you mention initiative.

It could have the.

Speaker 2 00:03:43

Icon yes, actually, uh, general sweeping change whenever abilities reference, uh, gaining something, losing something, uh, increasing something or decreasing something, uh, in terms of stats, it should also have the icon of the relevant stat.

Speaker 1 00:04:01

Yeah, yeah. That would make it much more easy to track down what's going on.

Speaker 2 00:04:06

And the icon for speed should be different from the icon for initiative.

But the relationship should be obvious about how uh.

Speed is something that increases initiative, Uh.

But we need to figure out what the actual icons that we'll use are. Possibly just rename speed initiative to something else.

Speaker 1 00:04:33

Nice. Umm.

Human Priest Club.

Archer goblin shaman can go.

If you increased.

And they can both go to.

Umm.

Not decay.

Uh oh.

This could be quite handy for my populist items.

It's too quick.

He's.

Let's lose Lose 5 initiative.

Avery Beach.

Which means this would basically.

Immediately go to 0.

Umm wait. OK wait. How is the relationship between initiative and speed work again? Like if I lose 5 initiative, is that the same as this number going down by 5? Uh.

Speaker 2 00:05:42

Yeah, so Hayes effectively means all units lose 5 speed.

Uh, it doesn't.

Speaker 1 00:05:47

You are losing speed.

Speaker 2 00:05:50

Uh, so.

Speed gives you initiative every beat.

Speaker 1 00:05:55

OK.

So it's a Rep like speed is.

Speaker 2 00:06:01

He should just, uh, uh, bookmark uh, Hayes should just say all units lose 5 speed.

Speaker 1 00:06:09

OK, OK. Are niche cases.

Speaker 2 00:06:11

Where these are in fact different.

Speaker 1 00:06:14

OK, but but in this case it's basically.

Speaker 2 00:06:19

Unless there are special effects that interact with.

Speed as a percentage, for example, they are equivalent.

Speaker 1 00:06:25

But what happens is that I gain 8.8 speed every beat, but I also lose 5 so I end up with three-point.

Speaker 2 00:06:32

Eight. Yeah. So you gain every beat, yes.

Speaker 1 00:06:37

So it slows me down each beat. It doesn't take me to 0. Yes. OK, OK, cool.

Uh, in that case, how speedy are these guys? They're quite speedy.

Uh, this? I don't have all that much help, so I don't really want that.

But I can't put him here. So which one? Oh, wait, I can put him here. Oh, wait. How did that happen? Because you took dump thumping? I don't know.

Cool.

Huh. I notice that when I'm comparing.

I cannot hover over or any of the things because it disappears.

Speaker 2 00:07:14

Yeah, you just need to click on the unit and then lock onto that one.

Speaker 1 00:07:18

MMM, OK.

I dislike that.

Speaker 2 00:07:24

If you have an elegant solution for this, I'm all ears, but.

Speaker 1 00:07:28

Have it hold them both up when.

Speaker 2 00:07:31

And no. So how would you then make it, uh, deselect one of them or deselect another one? Or what would happen if you select a third thing?

Speaker 1 00:07:41

If you select a third thing, replace.

In the same way that it replaces this way with a small pause between.

Speaker 2 00:07:53

OK, uh, bookmark.

Uh, make it so that you can pin two different, uh.

Selections, uh, in the left sidebar, umm, and if selecting something with two already selected, it should replace the second one. The only way to, uh, replace the first selection would be to manually unselect.

That selection?

Speaker 1 00:08:22

The way I would phrase this, I am possibly. I don't know if this makes it confusing, but.

Is that you don't, uh, don't have this go away when you unhover it, but have it go away when you hover something else.

Speaker 2 00:08:41

No, no, not doing that.

Speaker 1 00:08:42

Fascinating. No, that's fine. It's cleaner. It it, it is. It's the exact.

Speaker 2 00:08:45

Same. It is not cleaner anyone I I in.

Speaker 1 00:08:48

Terms of browser based like actions and events.

I like it's it's doing a on hover show this I I but you want it to unhover. Stick this and and have.

Speaker 2 00:09:03

It, I am not going to debate you on this. Uh, I'm not doing that. Uh, I appreciate the.

Speaker 1 00:09:07

Feedback. OK, but how is what you said different from that? I uh, you can just not answer that, OK?

And cycle.

MMM.

Hmm, I noticed there's a consistent thing where buttons have a hesitation thing, probably because they're waiting for something to come back before they give a reaction, and it possibly would be good to have it explicitly be that as soon as it receives the click it does a state change.

Even if it's waiting for updates from the server or something. Yeah, that's a good idea. Just that the user knows that something's happening. Yep.

MMM.

I guess I'll add bookmark to that since you are.

Good with the idea.

Cool. Umm.

OK, Yeah.

So I didn't select anything. Essence is at 0, Suspend essence.

Yeah. OK, so this is just like an artifact of something. OK, cool.

Uh, death happened.

Speaker 2 00:10:17

Bookmark Remove the essence counter completely and make it so that the victory points.

Do not have any on hover effect or indicator that it wants to be interacted with.

Speaker 1 00:10:46

Interesting.

I've never any adjacent to a soldier.

Sit by another.

Oh, OK.

Enemy doesn't disappear. Was hit by another allies normal attack. That soldier makes a normal attack again.

Oh, it's like teamwork, except dream work.

Speaker 2 00:11:16

Yes.

Speaker 1 00:11:19

That's that's cute. I like it.

Umm team.

Mm-hmm.

Is this? Does this ever get used for anything? This area up here?

Speaker 2 00:11:41

Uh, it it does if there are enough units on the battlefield. Ah, that makes sense. OK, cool.

Speaker 1 00:11:53

Movies.

OK.

I'm not sure about the suggestion, but.

Thematically or like vibes wise, I feel like putting this panel above this would make more sense.

Because it's basically controlling this, not this.

Umm, and it feels slightly weird that I have to go over here for the play button.

Versus like clicking a play like up here or something.

Speaker 2 00:12:44

How about there?

Speaker 1 00:12:45

That's what I was initially thinking about, but then I was thinking if, because that was why I asked if this gets used or anything. Uh-huh. Yeah, definitely. If it fits on here, this would be ideal. It would be to have.

The controls along with the reset, zoom and stuff all in.

Speaker 2 00:12:59

One yeah, bookmark. Move the replay control panel to the top left of the central panel containing the hex map and remove all text from all of the buttons. Instead of play, have the canonical right pointing arrow for play.

A loopy arrow for reset and back and forth or like left and right arrows for previous and next step.

And uh, no name, uh, no word for speed, just uh, drop down menu that says 4X uh, or whatever. It's self-explanatory.

Speaker 1 00:13:40

Yeah, nice.

Oh, really? That?

Nope, he killed everything.

That work Ranger is powerful.

Although he's also nearly dead.

But.

OK, back to archive. Oh.

OK weird thing, I just I think this was true every before too, but I only just now noticed it.

Clicking back to Archive and clicking Return to Rifts do the exact same thing.

Speaker 2 00:14:26

Uh, yeah, except oh, I see. Like they just.

Speaker 1 00:14:31

Take me back to the YEAH panel.

Uh, my suggestion would be to just remove this.

Speaker 2 00:14:39

One, it's a bookmark. Remove the back to archive in the top right from the replay screen. It duplicates functionality with the top left one.

Speaker 1 00:14:51

The log button is that the same log button as is over here?

Speaker 2 00:14:56

Uh, not exactly this one. This one gives you the state of this fight specifically. The other one gives you the state of the entire campaign.

Speaker 1 00:15:07

OK, OK.

State, but it is just troubleshooting not not not like a log related to.

OK, OK.

Reports. So I would like sort of suggest something like Oh yeah, also put the log over here in the same spot as it is in the other thing.

Especially if you're removing the things so there's space there anyway.

Like if the back to archive is going away, you could just put the log in this spot and keep it consistent everywhere.

Speaker 2 00:15:42

Yep, uh, bookmark move, uh, in battle. Replay, uh, debug log button to the top right so that it is visually identically located to the overworld log button.

In the space that is given by to the right of the overview event log, uh, tab selection.

Speaker 1 00:16:06

Nice.

OK, OK. That's all of my feedback on this.

Palmer.

OK, so I'm gonna buy my stuff.

MMM.

I want to.

Goblin Goblin.

Government militia? That seems useful.

Then hold the standard.

Held by rival.

I want to kill you.

Rival.

Archer.

Oh, it's very strong though.

His Audiences 5.

Beat so he will have.

Should fall.

And this one would have a little bit and I bet the goblins can take him down.

And the human archery together.

MMM Garden Shannon.

Umm.

It's so good if you have a lot of guys.

Fortunately, in Japan.

I don't have a problem showing them go up again.

And the work Rangers.

See if they can outdated us.

No, I died.

MMM.

I think this was also the case on the other one.

But the the formatting of this OK when once this pops up, it's a little less weird, but like the formatting is kind of like the button is over here on the left instead of on the right and it's a bit wonky.

I'm going to get some orcs.

OK, did I, OK, actually won these two.

I lost this one.

MMM 1 something.

That was my showman. OK so my YouTube got paid off.

And so did this one.

Whoa, it's so cool. I can see all my little goblins.

They are gobblers. Yes, my moisture of goblins.

What should you kill for?

Thy dwarven soldiers.

Dying without vomiting.

Getting surrounded.

So good.

Speaker 2 00:20:02

Yeah.

Speaker 1 00:20:15

Cool. OK.

So given that I won two fights.

Why do I only control 1 rift?

Speaker 2 00:21:04

Uh, probably because uh, you got defeated by the AI afterwards, uh, in the same instant.

Speaker 1 00:21:18

OK, this one will be.

Oh, each of the icons for a rift is unique.

So we had a fight back and forth on the OR something like that.

Gas cycle one with two.

Cycle one with two. How is a two different?

Huh. Oh. Does it mean that I.

That they sent or that I?

Why? So these these are three different fights in the same rift. I won the first one. Uh-huh.

I something.

Speaker 2 00:22:01

The opponent won the second one.

And then you lost the fight against the opponent. Like if both of you beat the neutral creatures then you 2 fight each other.

Speaker 1 00:22:12

Oh, I didn't know that. OK.

Speaker 2 00:22:15

Yes.

MMM.

Bookmark umm in contest versus AI, uh, when your forces get to the point of fighting the enemy forces, uh, it uh, looks like when you get defeated, it shows a red remaining health bar on the left hand side. Uh, that there's still something uh, ****** ** even in single player.

Regarding.

The display of information.

Speaker 1 00:22:59

MMM, OK.

All right, I'm going to cut it there and send you the texts.