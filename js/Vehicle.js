import * as THREE from 'three';
import { rigidBody } from 'crashcat';

const _tmpVec = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _worldUp = new THREE.Vector3( 0, 1, 0 );
const _yawQuat = new THREE.Quaternion();

const SPEED_SCALE = 12.5;
const LINEAR_DAMP = 0.1;
const JUMP_SPEED = 5.5;
const VEHICLE_SPHERE_RADIUS = 0.5;
const GROUNDED_VERTICAL_SPEED = 1.5;
const AIR_CONTROL_FACTOR = 0.35;

function lerpAngle( a, b, t ) {

	let diff = b - a;
	while ( diff > Math.PI ) diff -= Math.PI * 2;
	while ( diff < -Math.PI ) diff += Math.PI * 2;
	return a + diff * t;

}

export class Vehicle {

	constructor() {

		this.linearSpeed = 0;
		this.angularSpeed = 0;
		this.acceleration = 0;
		this.heading = 0;

		this.spherePos = new THREE.Vector3( 3.5, VEHICLE_SPHERE_RADIUS, 5 );
		this.sphereVel = new THREE.Vector3();

		this.rigidBody = null;
		this.collisionBody = null;
		this.physicsWorld = null;

		this.modelVelocity = new THREE.Vector3();
		this.prevModelPos = new THREE.Vector3( 3.5, 0, 5 );

		this.colliding = false;
		this.normal = new THREE.Vector3( 0, 1, 0 );

		this.container = new THREE.Group();
		this.bodyNode = null;
		this.wheels = [];
		this.wheelFL = null;
		this.wheelFR = null;
		this.wheelBL = null;
		this.wheelBR = null;

		this.inputX = 0;
		this.inputZ = 0;

		this.driftIntensity = 0;
		this.isGrounded = false;
		this.justReset = false;

	}

	init( model ) {

		const vehicleModel = model.clone();
		let colliderNode = null;

		this.container.add( vehicleModel );

		// Find body and wheel nodes
		vehicleModel.traverse( ( child ) => {

			const name = child.name.toLowerCase();

			if ( ! colliderNode && name.includes( 'collider' ) ) colliderNode = child;

			if ( name === 'body' ) {

				child.rotation.order = 'YXZ';
				this.bodyNode = child;

			} else if ( name.includes( 'wheel' ) ) {

				child.rotation.order = 'YXZ';
				this.wheels.push( child );

				if ( name.includes( 'front' ) && name.includes( 'left' ) ) this.wheelFL = child;
				if ( name.includes( 'front' ) && name.includes( 'right' ) ) this.wheelFR = child;
				if ( name.includes( 'back' ) && name.includes( 'left' ) ) this.wheelBL = child;
				if ( name.includes( 'back' ) && name.includes( 'right' ) ) this.wheelBR = child;

			}

			if ( child.isMesh ) {

				child.castShadow = true;
				child.receiveShadow = true;

			}

		} );

		if ( colliderNode ) colliderNode.visible = false;

		return this.container;

	}

	update( dt, controlsInput, groundState = null ) {

		this.justReset = false;

		if ( this.rigidBody ) {

			const pos = this.rigidBody.position;
			this.spherePos.set( pos[ 0 ], pos[ 1 ], pos[ 2 ] );

			const vel = this.rigidBody.motionProperties.linearVelocity;
			this.sphereVel.set( vel[ 0 ], vel[ 1 ], vel[ 2 ] );

		}

		this.inputX = controlsInput.x;
		this.inputZ = controlsInput.z;

		if ( groundState?.normal ) {

			this.normal.copy( groundState.normal );

		} else {

			this.normal.copy( _worldUp );

		}

		const isGrounded = !! groundState?.isGrounded &&
			Math.abs( this.sphereVel.y ) <= GROUNDED_VERTICAL_SPEED;
		this.isGrounded = isGrounded;

		if ( controlsInput.jump && isGrounded && this.rigidBody ) {

			rigidBody.setLinearVelocity( this.physicsWorld, this.rigidBody, [
				this.sphereVel.x,
				Math.max( this.sphereVel.y, JUMP_SPEED ),
				this.sphereVel.z
			] );
			this.sphereVel.y = Math.max( this.sphereVel.y, JUMP_SPEED );

		}

		let direction = Math.sign( this.linearSpeed );
		if ( direction === 0 ) direction = Math.abs( this.inputZ ) > 0.1 ? Math.sign( this.inputZ ) : 1;

		const steeringGrip = THREE.MathUtils.clamp( Math.abs( this.linearSpeed ), 0.2, 1.0 ) *
			( isGrounded ? 1.0 : AIR_CONTROL_FACTOR );

		const targetAngular = - this.inputX * steeringGrip * 4 * direction;
		this.angularSpeed = THREE.MathUtils.lerp( this.angularSpeed, targetAngular, dt * 4 );

		this.heading += this.angularSpeed * dt;

		const targetUp = isGrounded ? this.normal : _worldUp;
		_yawQuat.setFromAxisAngle( _worldUp, this.heading );
		const targetQuat = this.alignWithY( _yawQuat, targetUp );
		this.container.quaternion.slerp( targetQuat, THREE.MathUtils.clamp( dt * ( isGrounded ? 10 : 4 ), 0, 1 ) );

		if ( isGrounded ) {

			if ( ! this.colliding ) {

				if ( this.bodyNode ) this.bodyNode.position.set( 0, 0.1, 0 );

			}

		}

		this.colliding = isGrounded;

		const targetSpeed = this.inputZ;

		if ( targetSpeed < 0 && this.linearSpeed > 0.01 ) {

			this.linearSpeed = THREE.MathUtils.lerp( this.linearSpeed, 0.0, dt * 8 );

		} else if ( targetSpeed < 0 ) {

			this.linearSpeed = THREE.MathUtils.lerp( this.linearSpeed, targetSpeed / 2, dt * 2 );

		} else {

			this.linearSpeed = THREE.MathUtils.lerp( this.linearSpeed, targetSpeed, dt * 6 );

		}

		this.linearSpeed *= Math.max( 0, 1 - LINEAR_DAMP * dt );

		if ( this.rigidBody ) {

			_forward.set( Math.sin( this.heading ), 0, Math.cos( this.heading ) );
			_right.set( Math.cos( this.heading ), 0, - Math.sin( this.heading ) );

			const angvel = this.rigidBody.motionProperties.angularVelocity;
			const drive = this.linearSpeed * 100 * dt;

			rigidBody.setAngularVelocity( this.physicsWorld, this.rigidBody, [
				angvel[ 0 ] + _right.x * drive,
				angvel[ 1 ],
				angvel[ 2 ] + _right.z * drive
			] );

		}

		this.acceleration = THREE.MathUtils.lerp(
			this.acceleration,
			this.linearSpeed + ( 0.25 * this.linearSpeed * Math.abs( this.linearSpeed ) ),
			dt * 1
		);

		if ( this.spherePos.y < - 10 ) {

			if ( this.rigidBody ) {

				rigidBody.setPosition( this.physicsWorld, this.rigidBody, [ 3.5, VEHICLE_SPHERE_RADIUS, 5 ], false );
				rigidBody.setLinearVelocity( this.physicsWorld, this.rigidBody, [ 0, 0, 0 ] );
				rigidBody.setAngularVelocity( this.physicsWorld, this.rigidBody, [ 0, 0, 0 ] );

			}

			this.spherePos.set( 3.5, VEHICLE_SPHERE_RADIUS, 5 );
			this.sphereVel.set( 0, 0, 0 );
			this.linearSpeed = 0;
			this.angularSpeed = 0;
			this.acceleration = 0;
			this.heading = 0;
			this.container.rotation.set( 0, 0, 0 );
			this.container.quaternion.identity();
			this.justReset = true;

		}

		this.container.position.set(
			this.spherePos.x,
			this.spherePos.y - VEHICLE_SPHERE_RADIUS,
			this.spherePos.z
		);

		if ( dt > 0 ) {

			this.modelVelocity.subVectors( this.container.position, this.prevModelPos ).divideScalar( dt );
			this.prevModelPos.copy( this.container.position );

		}

		this.updateBody( dt );
		this.updateWheels( dt );

		this.driftIntensity = Math.abs( this.linearSpeed - this.acceleration ) +
			( this.bodyNode ? Math.abs( this.bodyNode.rotation.z ) * 2 : 0 );

	}

	alignWithY( quaternion, newY ) {

		const zAxis = new THREE.Vector3( 0, 0, 1 ).applyQuaternion( quaternion );
		const projectedZ = zAxis.projectOnPlane( newY );

		if ( projectedZ.lengthSq() < 1e-6 ) {

			projectedZ.set( 0, 0, 1 ).projectOnPlane( newY );

		}

		projectedZ.normalize();
		const xAxis = _tmpVec.crossVectors( newY, projectedZ ).normalize();
		const newZ = new THREE.Vector3().crossVectors( xAxis, newY ).normalize();

		const m = new THREE.Matrix4().makeBasis( xAxis, newY, newZ );
		return new THREE.Quaternion().setFromRotationMatrix( m );

	}

	updateBody( dt ) {

		if ( ! this.bodyNode ) return;

		this.bodyNode.rotation.x = lerpAngle(
			this.bodyNode.rotation.x,
			-( this.linearSpeed - this.acceleration ) / 6,
			dt * 10
		);

		this.bodyNode.rotation.z = lerpAngle(
			this.bodyNode.rotation.z,
			-( this.inputX / 5 ) * this.linearSpeed,
			dt * 5
		);

		this.bodyNode.position.y = THREE.MathUtils.lerp( this.bodyNode.position.y, this.isGrounded ? 0.2 : 0.3, dt * 5 );

	}

	updateWheels( dt ) {

		for ( const wheel of this.wheels ) {

			wheel.rotation.x += this.acceleration;

		}

		if ( this.wheelFL ) {

			this.wheelFL.rotation.y = lerpAngle( this.wheelFL.rotation.y, -this.inputX / 1.5, dt * 10 );

		}

		if ( this.wheelFR ) {

			this.wheelFR.rotation.y = lerpAngle( this.wheelFR.rotation.y, -this.inputX / 1.5, dt * 10 );

		}

	}

}
