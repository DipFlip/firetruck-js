import * as THREE from 'three';

// Flip this off to restore the old keyboard steering/throttle behavior.
const USE_SCREEN_RELATIVE_KEYBOARD_DRIVE = true;

export class Controls {

	constructor() {

		this.keys = {};
		this.driveX = 0;
		this.driveZ = 0;
		this.cannonX = 0;
		this.cannonY = 0;
		this.water = false;
		this.jump = false;
		this.jumpHeld = false;
		this.touchDriveActive = false;
		this.prevJumpDown = false;
		this.trackedKeys = new Set( [
			'KeyA', 'KeyD', 'KeyW', 'KeyS',
			'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
			'Space'
		] );

		// Touch state
		this.touchDriveX = 0;
		this.touchDriveZ = 0;
		this.touchAimX = 0;
		this.touchAimY = 0;
		this.drivePointerId = null;
		this.driveStartX = 0;
		this.driveStartY = 0;
		this.aimPointerId = null;
		this.aimStartX = 0;
		this.aimStartY = 0;

		window.addEventListener( 'keydown', ( e ) => {

			if ( ! this.trackedKeys.has( e.code ) ) return;
			this.keys[ e.code ] = true;
			if ( e.code.startsWith( 'Arrow' ) || e.code === 'Space' ) e.preventDefault();

		} );
		window.addEventListener( 'keyup', ( e ) => {

			if ( ! this.trackedKeys.has( e.code ) ) return;
			this.keys[ e.code ] = false;
			if ( e.code.startsWith( 'Arrow' ) || e.code === 'Space' ) e.preventDefault();

		} );

		this.setupTouchUI();

	}

	setupTouchUI() {

		if ( ! ( 'ontouchstart' in window ) ) return;

		const css = document.createElement( 'style' );
		css.textContent = `
			.touch-controls { position: absolute; bottom: 0; left: 0; right: 0; height: 50%; pointer-events: none; z-index: 10; }
			.drive-zone { position: absolute; left: 0; top: 0; bottom: 0; width: 45%; pointer-events: auto; touch-action: none; }
			.aim-zone { position: absolute; right: 0; top: 0; bottom: 0; width: 45%; pointer-events: auto; touch-action: none; }
			.drive-base { position: absolute; bottom: 24px; left: 24px; width: 140px; height: 140px; border-radius: 50%; background: rgba(255,255,255,0.1); border: 2px solid rgba(255,255,255,0.2); }
			.drive-knob { position: absolute; top: 50%; left: 50%; width: 60px; height: 60px; margin: -30px 0 0 -30px; border-radius: 50%; background: rgba(255,255,255,0.35); transition: transform 0.05s; }
			.aim-base { position: absolute; bottom: 24px; right: 24px; width: 140px; height: 140px; border-radius: 50%; background: rgba(80,170,255,0.1); border: 2px solid rgba(130,200,255,0.25); }
			.aim-knob { position: absolute; top: 50%; left: 50%; width: 60px; height: 60px; margin: -30px 0 0 -30px; border-radius: 50%; background: rgba(120,200,255,0.35); transition: transform 0.05s; }
		`;
		document.head.appendChild( css );

		const container = document.createElement( 'div' );
		container.className = 'touch-controls';

		// Left: relative drive joystick
		const driveZone = document.createElement( 'div' );
		driveZone.className = 'drive-zone';

		const driveBase = document.createElement( 'div' );
		driveBase.className = 'drive-base';
		const driveKnob = document.createElement( 'div' );
		driveKnob.className = 'drive-knob';
		driveBase.appendChild( driveKnob );
		driveZone.appendChild( driveBase );

		const aimZone = document.createElement( 'div' );
		aimZone.className = 'aim-zone';

		const aimBase = document.createElement( 'div' );
		aimBase.className = 'aim-base';
		const aimKnob = document.createElement( 'div' );
		aimKnob.className = 'aim-knob';
		aimBase.appendChild( aimKnob );
		aimZone.appendChild( aimBase );

		container.appendChild( driveZone );
		container.appendChild( aimZone );
		document.body.appendChild( container );

		// Drive: drag anywhere in the left half for relative steer/throttle.
		const driveRange = 60;
		const aimRange = 50;

		driveZone.addEventListener( 'pointerdown', ( e ) => {

			if ( this.drivePointerId !== null ) return;
			driveZone.setPointerCapture( e.pointerId );
			this.drivePointerId = e.pointerId;
			this.driveStartX = e.clientX;
			this.driveStartY = e.clientY;
			this.touchDriveActive = true;
			this.touchDriveX = 0;
			this.touchDriveZ = 0;

		} );

		driveZone.addEventListener( 'pointermove', ( e ) => {

			if ( e.pointerId !== this.drivePointerId ) return;
			let dx = THREE.MathUtils.clamp( ( e.clientX - this.driveStartX ) / driveRange, - 1, 1 );
			let dz = THREE.MathUtils.clamp( ( this.driveStartY - e.clientY ) / driveRange, - 1, 1 );
			const length = Math.hypot( dx, dz );
			if ( length > 1 ) {

				dx /= length;
				dz /= length;

			}

			this.touchDriveX = dx;
			this.touchDriveZ = dz;
			driveKnob.style.transform = `translate(${ dx * 40 }px, ${ - dz * 40 }px)`;

		} );

		const endDrive = ( e ) => {

			if ( e.pointerId !== this.drivePointerId ) return;
			this.drivePointerId = null;
			this.touchDriveActive = false;
			this.touchDriveX = 0;
			this.touchDriveZ = 0;
			driveKnob.style.transform = '';

		};

		driveZone.addEventListener( 'pointerup', endDrive );
		driveZone.addEventListener( 'pointercancel', endDrive );

		aimZone.addEventListener( 'pointerdown', ( e ) => {

			if ( this.aimPointerId !== null ) return;
			aimZone.setPointerCapture( e.pointerId );
			this.aimPointerId = e.pointerId;
			this.aimStartX = e.clientX;
			this.aimStartY = e.clientY;
			this.touchAimX = 0;
			this.touchAimY = 0;

		} );

		aimZone.addEventListener( 'pointermove', ( e ) => {

			if ( e.pointerId !== this.aimPointerId ) return;
			const dx = THREE.MathUtils.clamp( ( e.clientX - this.aimStartX ) / aimRange, - 1, 1 );
			const dy = THREE.MathUtils.clamp( ( this.aimStartY - e.clientY ) / aimRange, - 1, 1 );
			this.touchAimX = dx;
			this.touchAimY = dy;
			aimKnob.style.transform = `translate(${ dx * 40 }px, ${ - dy * 40 }px)`;

		} );

		const endAim = ( e ) => {

			if ( e.pointerId !== this.aimPointerId ) return;
			this.aimPointerId = null;
			this.touchAimX = 0;
			this.touchAimY = 0;
			aimKnob.style.transform = '';

		};

		aimZone.addEventListener( 'pointerup', endAim );
		aimZone.addEventListener( 'pointercancel', endAim );

	}

	update() {

		let driveX = 0, driveZ = 0;
		let cannonX = 0, cannonY = 0;
		let jumpDown = false;
		let keyboardDriveActive = false;

		// Keyboard

		if ( this.keys[ 'KeyA' ] ) {

			driveX -= 1;
			keyboardDriveActive = true;

		}
		if ( this.keys[ 'KeyD' ] ) {

			driveX += 1;
			keyboardDriveActive = true;

		}
		if ( this.keys[ 'KeyW' ] ) {

			driveZ += 1;
			keyboardDriveActive = true;

		}
		if ( this.keys[ 'KeyS' ] ) {

			driveZ -= 1;
			keyboardDriveActive = true;

		}
		if ( this.keys[ 'ArrowLeft' ] ) cannonX -= 1;
		if ( this.keys[ 'ArrowRight' ] ) cannonX += 1;
		if ( this.keys[ 'ArrowUp' ] ) cannonY += 1;
		if ( this.keys[ 'ArrowDown' ] ) cannonY -= 1;
		if ( this.keys[ 'Space' ] ) jumpDown = true;

		// Gamepad

		const gamepads = navigator.getGamepads();

		for ( const gp of gamepads ) {

			if ( ! gp ) continue;

			const stickX = gp.axes[ 0 ];
			if ( Math.abs( stickX ) > 0.15 ) driveX = stickX;

			const rt = gp.buttons[ 7 ] ? gp.buttons[ 7 ].value : 0;
			const lt = gp.buttons[ 6 ] ? gp.buttons[ 6 ].value : 0;
			const southButton = gp.buttons[ 0 ] ? gp.buttons[ 0 ].pressed : false;

			if ( rt > 0.1 || lt > 0.1 ) driveZ = rt - lt;
			if ( gp.axes.length >= 4 ) {

				if ( Math.abs( gp.axes[ 2 ] ) > 0.15 ) cannonX = gp.axes[ 2 ];
				if ( Math.abs( gp.axes[ 3 ] ) > 0.15 ) cannonY = - gp.axes[ 3 ];

			}
			if ( southButton ) jumpDown = true;

			break;

		}

		// Touch

		if ( Math.abs( this.touchDriveX ) > 0.01 ) driveX = this.touchDriveX;
		if ( Math.abs( this.touchDriveZ ) > 0.01 ) driveZ = this.touchDriveZ;
		if ( Math.abs( this.touchAimX ) > 0.01 ) cannonX = this.touchAimX;
		if ( Math.abs( this.touchAimY ) > 0.01 ) cannonY = this.touchAimY;

		const water = Math.hypot( cannonX, cannonY ) > 0.05;

		this.driveX = driveX;
		this.driveZ = driveZ;
		this.cannonX = cannonX;
		this.cannonY = cannonY;
		this.water = water;
		const jumpPressed = jumpDown && ! this.prevJumpDown;
		const jumpReleased = ! jumpDown && this.prevJumpDown;
		this.jump = jumpDown;
		this.jumpHeld = jumpDown;
		this.prevJumpDown = jumpDown;
		const screenRelativeDriveActive = this.touchDriveActive ||
			( USE_SCREEN_RELATIVE_KEYBOARD_DRIVE && keyboardDriveActive );

		return {
			driveX,
			driveZ,
			cannonX,
			cannonY,
			water,
			jump: this.jump,
			jumpHeld: this.jumpHeld,
			touchDriveActive: this.touchDriveActive,
			screenRelativeDriveActive,
			jumpPressed,
			jumpReleased,
			x: driveX,
			z: driveZ,
		};

	}

}
