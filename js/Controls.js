import * as THREE from 'three';

export class Controls {

	constructor() {

		this.keys = {};
		this.driveX = 0;
		this.driveZ = 0;
		this.cannonX = 0;
		this.cannonY = 0;
		this.water = false;
		this.jump = false;
		this.prevJumpDown = false;
		this.trackedKeys = new Set( [
			'KeyA', 'KeyD', 'KeyW', 'KeyS',
			'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
			'Space'
		] );

		// Touch state
		this.touchSteer = 0;
		this.touchGas = false;
		this.touchBrake = false;
		this.touchAimX = 0;
		this.touchAimY = 0;
		this.steerPointerId = null;
		this.steerStartX = 0;
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
			.steer-zone { position: absolute; left: 0; top: 0; bottom: 0; width: 45%; pointer-events: auto; touch-action: none; }
			.aim-zone { position: absolute; right: 0; top: 0; bottom: 120px; width: 45%; pointer-events: auto; touch-action: none; }
			.steer-base { position: absolute; bottom: 24px; left: 24px; width: 140px; height: 140px; border-radius: 50%; background: rgba(255,255,255,0.1); border: 2px solid rgba(255,255,255,0.2); }
			.steer-knob { position: absolute; top: 50%; left: 50%; width: 60px; height: 60px; margin: -30px 0 0 -30px; border-radius: 50%; background: rgba(255,255,255,0.35); transition: transform 0.05s; }
			.aim-base { position: absolute; bottom: 24px; right: 24px; width: 140px; height: 140px; border-radius: 50%; background: rgba(80,170,255,0.1); border: 2px solid rgba(130,200,255,0.25); }
			.aim-knob { position: absolute; top: 50%; left: 50%; width: 60px; height: 60px; margin: -30px 0 0 -30px; border-radius: 50%; background: rgba(120,200,255,0.35); transition: transform 0.05s; }
			.btn-zone { position: absolute; right: 24px; bottom: 24px; pointer-events: auto; touch-action: none; }
			.touch-btn { width: 76px; height: 76px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.25); color: rgba(255,255,255,0.5); font: bold 13px -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; user-select: none; -webkit-user-select: none; touch-action: none; position: absolute; }
			.touch-btn.gas { background: rgba(80,180,80,0.25); right: 0; bottom: 80px; }
			.touch-btn.gas.active { background: rgba(80,180,80,0.5); border-color: rgba(80,180,80,0.6); }
			.touch-btn.brake { background: rgba(200,80,80,0.25); right: 80px; bottom: 0; }
			.touch-btn.brake.active { background: rgba(200,80,80,0.5); border-color: rgba(200,80,80,0.6); }
		`;
		document.head.appendChild( css );

		const container = document.createElement( 'div' );
		container.className = 'touch-controls';

		// Left: steering zone with joystick
		const steerZone = document.createElement( 'div' );
		steerZone.className = 'steer-zone';

		const base = document.createElement( 'div' );
		base.className = 'steer-base';
		const knob = document.createElement( 'div' );
		knob.className = 'steer-knob';
		base.appendChild( knob );
		steerZone.appendChild( base );

		const aimZone = document.createElement( 'div' );
		aimZone.className = 'aim-zone';

		const aimBase = document.createElement( 'div' );
		aimBase.className = 'aim-base';
		const aimKnob = document.createElement( 'div' );
		aimKnob.className = 'aim-knob';
		aimBase.appendChild( aimKnob );
		aimZone.appendChild( aimBase );

		// Right: gas and brake buttons
		// Right: gas (top-right) and brake (bottom-left) — diagonal for comfortable thumb reach
		const btnZone = document.createElement( 'div' );
		btnZone.className = 'btn-zone';

		const gasBtn = document.createElement( 'div' );
		gasBtn.className = 'touch-btn gas';
		gasBtn.textContent = 'GAS';

		const brakeBtn = document.createElement( 'div' );
		brakeBtn.className = 'touch-btn brake';
		brakeBtn.textContent = 'BRK';

		btnZone.appendChild( gasBtn );
		btnZone.appendChild( brakeBtn );

		container.appendChild( steerZone );
		container.appendChild( aimZone );
		container.appendChild( btnZone );
		document.body.appendChild( container );

		// Steering: drag left/right anywhere in the left half
		const steerRange = 60;
		const aimRange = 50;

		steerZone.addEventListener( 'pointerdown', ( e ) => {

			if ( this.steerPointerId !== null ) return;
			steerZone.setPointerCapture( e.pointerId );
			this.steerPointerId = e.pointerId;
			this.steerStartX = e.clientX;
			this.touchSteer = 0;

		} );

		steerZone.addEventListener( 'pointermove', ( e ) => {

			if ( e.pointerId !== this.steerPointerId ) return;
			const dx = e.clientX - this.steerStartX;
			this.touchSteer = Math.max( - 1, Math.min( 1, dx / steerRange ) );
			knob.style.transform = `translateX(${ this.touchSteer * 40 }px)`;

		} );

		const endSteer = ( e ) => {

			if ( e.pointerId !== this.steerPointerId ) return;
			this.steerPointerId = null;
			this.touchSteer = 0;
			knob.style.transform = '';

		};

		steerZone.addEventListener( 'pointerup', endSteer );
		steerZone.addEventListener( 'pointercancel', endSteer );

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

		// Gas button
		gasBtn.addEventListener( 'pointerdown', ( e ) => {

			gasBtn.setPointerCapture( e.pointerId );
			this.touchGas = true;
			gasBtn.classList.add( 'active' );

		} );

		const endGas = () => {

			this.touchGas = false;
			gasBtn.classList.remove( 'active' );

		};

		gasBtn.addEventListener( 'pointerup', endGas );
		gasBtn.addEventListener( 'pointercancel', endGas );

		// Brake button
		brakeBtn.addEventListener( 'pointerdown', ( e ) => {

			brakeBtn.setPointerCapture( e.pointerId );
			this.touchBrake = true;
			brakeBtn.classList.add( 'active' );

		} );

		const endBrake = () => {

			this.touchBrake = false;
			brakeBtn.classList.remove( 'active' );

		};

		brakeBtn.addEventListener( 'pointerup', endBrake );
		brakeBtn.addEventListener( 'pointercancel', endBrake );

	}

	update() {

		let driveX = 0, driveZ = 0;
		let cannonX = 0, cannonY = 0;
		let jumpDown = false;

		// Keyboard

		if ( this.keys[ 'KeyA' ] ) driveX -= 1;
		if ( this.keys[ 'KeyD' ] ) driveX += 1;
		if ( this.keys[ 'KeyW' ] ) driveZ += 1;
		if ( this.keys[ 'KeyS' ] ) driveZ -= 1;
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

		if ( this.touchSteer !== 0 ) driveX = this.touchSteer;
		if ( this.touchGas ) driveZ = 1;
		if ( this.touchBrake ) driveZ = - 1;
		if ( Math.abs( this.touchAimX ) > 0.01 ) cannonX = this.touchAimX;
		if ( Math.abs( this.touchAimY ) > 0.01 ) cannonY = this.touchAimY;

		const water = Math.hypot( cannonX, cannonY ) > 0.05;

		this.driveX = driveX;
		this.driveZ = driveZ;
		this.cannonX = cannonX;
		this.cannonY = cannonY;
		this.water = water;
		this.jump = jumpDown && ! this.prevJumpDown;
		this.prevJumpDown = jumpDown;

		return {
			driveX,
			driveZ,
			cannonX,
			cannonY,
			water,
			jump: this.jump,
			x: driveX,
			z: driveZ,
		};

	}

}
